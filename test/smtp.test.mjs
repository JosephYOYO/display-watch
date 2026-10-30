import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import nodemailer from 'nodemailer';
import { sendSmtp, validateMail, mailProvider } from '../src/mail.mjs';
const config = { machine:'test-mini', mail:{provider:'smtp',from:'sender@example.com',to:'receiver@example.com',smtp:{host:'smtp.example.com',port:587,secure:false,auth:{user:'test-user',pass:'test-password'}}} };
const event = { id:'smtp-test',kind:'test',time:'2026-10-30T00:00:00Z',display:{name:'Test display'} };

test('SMTP validates user-supplied settings, requires encryption, and retains legacy configuration', async () => {
  assert.equal(mailProvider(config.mail),'smtp');
  assert.equal(mailProvider({accessKeyId:'legacy'}),'aliyun');
  validateMail(config.mail);
  assert.throws(()=>validateMail({...config.mail,smtp:{...config.mail.smtp,port:0}}));
  assert.throws(()=>validateMail({...config.mail,to:'a@example.com,b@example.com'}));
  const result=await sendSmtp(config,event,options=>{
    assert.equal(options.host,'smtp.example.com'); assert.equal(options.requireTLS,true);
    assert.equal(options.tls.rejectUnauthorized,true); assert.equal(options.debug,false);
    return {sendMail:async message=>{
      assert.equal(message.to,'receiver@example.com');
      assert.equal(message.from.address,'sender@example.com');
      return {accepted:['receiver@example.com'],messageId:message.messageId};
    },close(){}};
  });
  assert.equal(result.status,'accepted');
});

test('SMTP TLS protocol: accepted mail, recipient rejection, and lost DATA acknowledgement', async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'display-watch-smtp-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const certPath=path.join(directory,'cert.pem'),keyPath=path.join(directory,'key.pem');
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
  const cert=fs.readFileSync(certPath),key=fs.readFileSync(keyPath);
  for(const mode of ['accept','reject','drop-after-data']) {
    await t.test(mode,async()=>{
      const sockets=new Set(); let body=''; let authenticated=false;
      const server=tls.createServer({cert,key},socket=>{
        sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
        socket.setEncoding('utf8');socket.write('220 localhost test SMTP\r\n');
        let buffer='',data=false;
        socket.on('data',chunk=>{
          buffer+=chunk;
          while(buffer.includes('\r\n')) {
            if(data){
              const end=buffer.indexOf('\r\n.\r\n');if(end<0)return;
              body=buffer.slice(0,end);buffer=buffer.slice(end+5);data=false;
              if(mode==='drop-after-data'){socket.destroy();return;}
              socket.write('250 2.0.0 queued\r\n');continue;
            }
            const end=buffer.indexOf('\r\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+2);
            if(line.startsWith('EHLO'))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
            else if(line.startsWith('AUTH')){authenticated=true;socket.write('235 2.7.0 authenticated\r\n');}
            else if(line.startsWith('MAIL FROM'))socket.write('250 2.1.0 OK\r\n');
            else if(line.startsWith('RCPT TO'))socket.write(mode==='reject'?'550 5.1.1 rejected\r\n':'250 2.1.5 OK\r\n');
            else if(line==='DATA'){data=true;socket.write('354 send data\r\n');}
            else if(line==='QUIT'){socket.end('221 bye\r\n');}
            else socket.write('250 OK\r\n');
          }
        });
      });
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      try {
        const c=structuredClone(config);Object.assign(c.mail.smtp,{host:'127.0.0.1',port:server.address().port,secure:true,servername:'localhost'});
        const result=await sendSmtp(c,event,options=>nodemailer.createTransport({...options,tls:{...options.tls,ca:cert}}));
        assert.equal(result.status,mode==='accept'?'accepted':mode==='reject'?'failed':'unknown');
        assert.ok(authenticated);
        if(mode!=='reject')assert.match(body,/receiver@example.com/);
      } finally {
        for(const socket of sockets)socket.destroy();
        await new Promise(resolve=>server.close(resolve));
      }
    });
  }
});
