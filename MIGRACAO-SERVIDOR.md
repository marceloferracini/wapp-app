# 🚀 Guia Completo de Migração para Novo Servidor

Este guia te ajudará a migrar a aplicação WhatsApp Webhook para um novo servidor do zero.

## 📋 Pré-requisitos

- Acesso SSH ao novo servidor (root ou usuário com sudo)
- Credenciais do WhatsApp Cloud API (Token, Phone Number ID, Verify Token)
- Chave da API OpenAI (se usar)
- Repositório Git configurado (GitHub/GitLab)

---

## 🔧 PASSO 1: Preparar o Servidor

### 1.1 Atualizar o sistema
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 1.2 Instalar Node.js 18+ (se não tiver)
```bash
# Opção 1: Usando NodeSource (recomendado)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Opção 2: Usando NVM (permite múltiplas versões)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# Verificar instalação
node --version  # Deve mostrar v18.x ou superior
npm --version
```

### 1.3 Instalar Git (se não tiver)
```bash
sudo apt install git -y  # Ubuntu/Debian
# ou
sudo yum install git -y  # CentOS/RHEL

git --version
```

### 1.4 Instalar PM2 globalmente
```bash
sudo npm install -g pm2

# Verificar instalação
pm2 --version

# Configurar PM2 para iniciar no boot
pm2 startup
# Execute o comando que aparecer (algo como: sudo env PATH=...)
```

---

## 📦 PASSO 2: Clonar o Repositório

### 2.1 Criar diretório da aplicação
```bash
# Escolha um diretório (exemplo: /opt/wapp-app)
sudo mkdir -p /opt/wapp-app
sudo chown $USER:$USER /opt/wapp-app
cd /opt/wapp-app
```

### 2.2 Clonar o repositório
```bash
# Se usar HTTPS
git clone https://github.com/marceloferracini/wapp-app.git .

# Se usar SSH
git clone git@github.com:marceloferracini/wapp-app.git .

# Verificar se clonou corretamente
ls -la
```

---

## 🔐 PASSO 3: Configurar Variáveis de Ambiente

### 3.1 Criar arquivo .env
```bash
cp ENV.example .env
nano .env  # ou use vi, vim, etc.
```

### 3.2 Preencher as variáveis
```env
WHATSAPP_TOKEN=seu_token_aqui
PHONE_NUMBER_ID=seu_phone_number_id
VERIFY_TOKEN=seu_verify_token_personalizado
PORT=8000
OPENAI_API_KEY=sua_chave_openai_opcional
```

**⚠️ IMPORTANTE:**
- `VERIFY_TOKEN`: Crie um token aleatório e seguro (ex: `openssl rand -hex 32`)
- `WHATSAPP_TOKEN`: Token permanente do WhatsApp Cloud API
- `PHONE_NUMBER_ID`: ID do número de telefone configurado na Meta
- `OPENAI_API_KEY`: Opcional, mas necessário se quiser respostas com IA

### 3.3 Proteger o arquivo .env
```bash
chmod 600 .env  # Apenas o dono pode ler/escrever
```

---

## 📥 PASSO 4: Instalar Dependências

```bash
cd /opt/wapp-app

# Instalar dependências de produção
npm ci --production

# Verificar se instalou corretamente
npm list --depth=0
```

---

## 🎯 PASSO 5: Configurar PM2

### 5.1 Criar arquivo de configuração do PM2 (opcional, mas recomendado)
```bash
nano ecosystem.config.js
```

Cole o seguinte conteúdo:
```javascript
module.exports = {
  apps: [{
    name: 'wapp-webhook',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 8000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M',
    watch: false
  }]
};
```

### 5.2 Criar diretório de logs
```bash
mkdir -p logs
```

### 5.3 Iniciar a aplicação com PM2
```bash
# Opção 1: Usando o arquivo de configuração
pm2 start ecosystem.config.js

# Opção 2: Comando direto
pm2 start server.js --name wapp-webhook

# Salvar configuração do PM2
pm2 save
```

### 5.4 Verificar status
```bash
pm2 status
pm2 logs wapp-webhook  # Ver logs em tempo real
pm2 info wapp-webhook  # Informações detalhadas
```

---

## 🔥 PASSO 6: Configurar Firewall

### 6.1 Abrir porta da aplicação
```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 8000/tcp
sudo ufw status

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --reload
```

### 6.2 Se usar Nginx como proxy reverso (recomendado para produção)
```bash
# Instalar Nginx
sudo apt install nginx -y  # Ubuntu/Debian

# Criar configuração
sudo nano /etc/nginx/sites-available/wapp-webhook
```

Conteúdo do arquivo Nginx:
```nginx
server {
    listen 80;
    server_name seu-dominio.com;  # ou IP do servidor

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ativar configuração:
```bash
sudo ln -s /etc/nginx/sites-available/wapp-webhook /etc/nginx/sites-enabled/
sudo nginx -t  # Testar configuração
sudo systemctl restart nginx
```

---

## ✅ PASSO 7: Testar a Aplicação

### 7.1 Verificar se está rodando
```bash
# Ver status do PM2
pm2 status

# Ver logs
pm2 logs wapp-webhook --lines 50

# Testar endpoint localmente
curl http://localhost:8000/webhook?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=test123
```

### 7.2 Verificar conectividade externa
```bash
# Do seu computador local, teste:
curl http://SEU_IP_OU_DOMINIO:8000/webhook?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=test123
```

---

## 🔗 PASSO 8: Configurar Webhook na Meta (WhatsApp Cloud API)

### 8.1 Obter URL pública
Você precisa de uma URL pública acessível pela Meta. Opções:

**Opção A: Usar domínio próprio (recomendado)**
- Configure DNS apontando para o servidor
- Use HTTPS (certificado SSL via Let's Encrypt)

**Opção B: Usar ngrok (desenvolvimento/testes)**
```bash
# Instalar ngrok
# Baixe de https://ngrok.com/download
# ou
sudo snap install ngrok

# Iniciar túnel
ngrok http 8000

# Copie a URL HTTPS gerada (ex: https://abc123.ngrok.io)
```

### 8.2 Configurar na Meta Developer Console
1. Acesse: https://developers.facebook.com/apps
2. Selecione sua app
3. Vá em **WhatsApp > Configuration**
4. Em **Webhook**, clique em **Edit**
5. Preencha:
   - **Callback URL**: `https://seu-dominio.com/webhook` (ou URL do ngrok)
   - **Verify Token**: O mesmo que colocou no `.env` (VERIFY_TOKEN)
6. Clique em **Verify and Save**
7. Em **Webhook fields**, marque: `messages`
8. Salve

### 8.3 Testar recebimento de mensagens
Envie uma mensagem de teste para o número configurado e verifique os logs:
```bash
pm2 logs wapp-webhook --lines 100
```

---

## 🔄 PASSO 9: Configurar Deploy Automático (Opcional)

O script `deploy-auto.sh` já está configurado. Para usar:

```bash
# Tornar executável
chmod +x deploy-auto.sh

# Testar o deploy
./deploy-auto.sh
```

**Nota:** O script assume que:
- O repositório já está clonado
- O arquivo `.env` já existe
- O PM2 já está configurado

---

## 🛠️ Comandos Úteis de Manutenção

```bash
# Ver logs em tempo real
pm2 logs wapp-webhook

# Reiniciar aplicação
pm2 restart wapp-webhook

# Parar aplicação
pm2 stop wapp-webhook

# Ver uso de recursos
pm2 monit

# Atualizar código manualmente
cd /opt/wapp-app
git pull origin main
npm ci --production
pm2 restart wapp-webhook

# Verificar porta em uso
sudo netstat -tlnp | grep 8000
# ou
sudo ss -tlnp | grep 8000
```

---

## 🐛 Troubleshooting

### Aplicação não inicia
```bash
# Ver logs detalhados
pm2 logs wapp-webhook --err --lines 100

# Verificar se .env está correto
cat .env

# Testar manualmente
node server.js
```

### PM2 não encontrado
```bash
# Reinstalar PM2
sudo npm install -g pm2

# Verificar PATH
which pm2
echo $PATH
```

### Porta já em uso
```bash
# Ver o que está usando a porta
sudo lsof -i :8000
# ou
sudo netstat -tlnp | grep 8000

# Matar processo (substitua PID pelo número encontrado)
kill -9 PID
```

### Webhook não recebe mensagens
1. Verifique se a URL está acessível publicamente
2. Verifique se o VERIFY_TOKEN está correto
3. Verifique logs: `pm2 logs wapp-webhook`
4. Teste o endpoint manualmente com curl

---

## 📝 Checklist Final

- [ ] Node.js 18+ instalado
- [ ] Git instalado
- [ ] PM2 instalado e configurado para iniciar no boot
- [ ] Repositório clonado
- [ ] Arquivo `.env` configurado com todas as variáveis
- [ ] Dependências instaladas (`npm ci --production`)
- [ ] Aplicação rodando no PM2
- [ ] Porta 8000 aberta no firewall
- [ ] URL pública configurada (domínio ou ngrok)
- [ ] Webhook configurado na Meta Developer Console
- [ ] Teste de envio de mensagem funcionando
- [ ] Logs sendo gerados corretamente

---

## 🎉 Pronto!

Sua aplicação deve estar rodando no novo servidor. Para atualizações futuras, use o script `deploy-auto.sh` ou faça manualmente com `git pull` + `pm2 restart`.

