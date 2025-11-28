# 🔒 Configurar Nginx + SSL para webhook.humanizi.ai

Este guia mostra como configurar Nginx com SSL (HTTPS) para o webhook do WhatsApp.

## 📋 Pré-requisitos

- Nginx instalado no servidor
- Domínio `webhook.humanizi.ai` apontando para o IP do servidor
- Aplicação rodando na porta 8000
- Acesso root ou sudo no servidor

---

## 🔧 PASSO 1: Instalar Nginx (se não tiver)

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx -y

# CentOS/RHEL
sudo yum install nginx -y

# Verificar status
sudo systemctl status nginx
```

---

## 🔧 PASSO 2: Criar Configuração do Nginx

### 2.1 Copiar arquivo de configuração

No servidor, copie o conteúdo do arquivo `nginx-webhook.humanizi.ai.conf` ou crie manualmente:

```bash
sudo nano /etc/nginx/sites-available/webhook.humanizi.ai
```

Cole o seguinte conteúdo:

```nginx
server {
    server_name webhook.humanizi.ai;

    # Webhook WhatsApp → Node na porta 8000
    location /webhook {
        proxy_pass http://127.0.0.1:8000/webhook;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts para evitar problemas com webhooks
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location / {
        return 200 'OK - webhook.humanizi.ai';
        add_header Content-Type text/plain;
    }

    listen 80;
    server_name webhook.humanizi.ai;
}
```

### 2.2 Ativar a configuração

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/webhook.humanizi.ai /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Se estiver OK, recarregar Nginx
sudo systemctl reload nginx
```

---

## 🔒 PASSO 3: Instalar Certbot (Let's Encrypt)

### 3.1 Instalar Certbot

```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx -y

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx -y
```

### 3.2 Obter Certificado SSL

```bash
sudo certbot --nginx -d webhook.humanizi.ai
```

O Certbot vai:
- Verificar o domínio
- Obter o certificado SSL
- Configurar automaticamente o Nginx para HTTPS
- Configurar redirect HTTP → HTTPS

**Durante o processo, o Certbot vai perguntar:**
- Email para notificações (opcional, mas recomendado)
- Aceitar termos de serviço
- Compartilhar email com EFF (opcional)

### 3.3 Verificar Renovação Automática

O Certbot configura renovação automática. Teste se está funcionando:

```bash
sudo certbot renew --dry-run
```

---

## ✅ PASSO 4: Verificar Configuração

### 4.1 Verificar se Nginx está rodando

```bash
sudo systemctl status nginx
```

### 4.2 Testar endpoint HTTP (deve redirecionar para HTTPS)

```bash
curl -I http://webhook.humanizi.ai
# Deve retornar: HTTP/1.1 301 Moved Permanently
```

### 4.3 Testar endpoint HTTPS

```bash
curl https://webhook.humanizi.ai
# Deve retornar: OK - webhook.humanizi.ai
```

### 4.4 Testar webhook (substitua SEU_VERIFY_TOKEN)

```bash
curl "https://webhook.humanizi.ai/webhook?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=test123"
# Deve retornar: test123
```

### 4.5 Verificar logs do Nginx

```bash
# Logs de acesso
sudo tail -f /var/log/nginx/access.log

# Logs de erro
sudo tail -f /var/log/nginx/error.log
```

---

## 🔧 PASSO 5: Configurar Webhook na Meta

1. Acesse: https://developers.facebook.com/apps
2. Selecione sua app
3. Vá em **WhatsApp > Configuration**
4. Em **Webhook**, clique em **Edit**
5. Preencha:
   - **Callback URL**: `https://webhook.humanizi.ai/webhook`
   - **Verify Token**: O mesmo que está no seu `.env` (VERIFY_TOKEN)
6. Clique em **Verify and Save**
7. Em **Webhook fields**, marque: `messages`
8. Salve

---

## 🛠️ Troubleshooting

### Erro: "domain verification failed"

- Verifique se o DNS está apontando corretamente:
  ```bash
  dig webhook.humanizi.ai
  # ou
  nslookup webhook.humanizi.ai
  ```
- Certifique-se que a porta 80 está aberta no firewall
- Verifique se o Nginx está rodando e respondendo na porta 80

### Erro: "502 Bad Gateway"

- Verifique se a aplicação está rodando na porta 8000:
  ```bash
  sudo netstat -tlnp | grep 8000
  # ou
  pm2 status
  ```
- Verifique os logs do Nginx:
  ```bash
  sudo tail -f /var/log/nginx/error.log
  ```

### Certificado não renova automaticamente

- Verifique o timer do systemd:
  ```bash
  sudo systemctl status certbot.timer
  ```
- Teste renovação manual:
  ```bash
  sudo certbot renew
  ```

### Webhook não recebe mensagens

1. Verifique se a URL está correta: `https://webhook.humanizi.ai/webhook`
2. Verifique logs da aplicação:
   ```bash
   pm2 logs wapp-webhook
   ```
3. Teste o endpoint manualmente:
   ```bash
   curl -X POST https://webhook.humanizi.ai/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

---

## 📝 Configuração Final Esperada

Após executar o Certbot, o arquivo `/etc/nginx/sites-available/webhook.humanizi.ai` deve estar assim:

```nginx
server {
    server_name webhook.humanizi.ai;

    location /webhook {
        proxy_pass http://127.0.0.1:8000/webhook;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location / {
        return 200 'OK - webhook.humanizi.ai';
        add_header Content-Type text/plain;
    }

    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/webhook.humanizi.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/webhook.humanizi.ai/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = webhook.humanizi.ai) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name webhook.humanizi.ai;
    return 404;
}
```

---

## ✅ Checklist Final

- [ ] Nginx instalado e rodando
- [ ] DNS apontando para o servidor
- [ ] Configuração do Nginx criada e ativada
- [ ] Certbot instalado
- [ ] Certificado SSL obtido e configurado
- [ ] Redirect HTTP → HTTPS funcionando
- [ ] Endpoint `/webhook` acessível via HTTPS
- [ ] Webhook configurado na Meta Developer Console
- [ ] Teste de envio de mensagem funcionando

---

## 🎉 Pronto!

Agora você pode usar `https://webhook.humanizi.ai/webhook` na configuração do webhook da Meta, sem precisar especificar a porta!

