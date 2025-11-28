#!/bin/bash

###############################################################################
# Script para configurar Nginx + SSL para webhook.humanizi.ai
###############################################################################

set -e

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

DOMAIN="webhook.humanizi.ai"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

function log_step() {
    echo -e "${BLUE}[*]${NC} $1"
}

function log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

function log_error() {
    echo -e "${RED}✗${NC} $1"
}

function log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Configuração Nginx + SSL para ${DOMAIN}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Verificar se é root
if [ "$EUID" -ne 0 ]; then 
    log_error "Este script precisa ser executado como root ou com sudo"
    exit 1
fi

# 1. Verificar Nginx
log_step "Verificando Nginx..."
if ! command -v nginx &> /dev/null; then
    log_warn "Nginx não encontrado. Instalando..."
    apt update
    apt install nginx -y
    log_success "Nginx instalado"
else
    log_success "Nginx já instalado"
fi

# 2. Criar configuração inicial (sem SSL ainda)
log_step "Criando configuração do Nginx..."
cat > "$NGINX_AVAILABLE" << 'EOF'
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
EOF

log_success "Configuração criada em $NGINX_AVAILABLE"

# 3. Ativar configuração
log_step "Ativando configuração..."
if [ -L "$NGINX_ENABLED" ]; then
    log_warn "Configuração já existe, removendo link antigo..."
    rm "$NGINX_ENABLED"
fi

ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
log_success "Configuração ativada"

# 4. Testar configuração
log_step "Testando configuração do Nginx..."
if nginx -t; then
    log_success "Configuração válida"
else
    log_error "Erro na configuração do Nginx!"
    exit 1
fi

# 5. Recarregar Nginx
log_step "Recarregando Nginx..."
systemctl reload nginx
log_success "Nginx recarregado"

# 6. Verificar Certbot
log_step "Verificando Certbot..."
if ! command -v certbot &> /dev/null; then
    log_warn "Certbot não encontrado. Instalando..."
    apt install certbot python3-certbot-nginx -y
    log_success "Certbot instalado"
else
    log_success "Certbot já instalado"
fi

# 7. Obter certificado SSL
echo ""
log_step "Obtendo certificado SSL..."
log_warn "O Certbot vai fazer algumas perguntas. Responda conforme necessário."
echo ""
read -p "Pressione Enter para continuar com o Certbot..."

certbot --nginx -d "$DOMAIN"

if [ $? -eq 0 ]; then
    log_success "Certificado SSL configurado com sucesso!"
else
    log_error "Falha ao obter certificado SSL"
    exit 1
fi

# 8. Testar renovação
log_step "Testando renovação automática do certificado..."
certbot renew --dry-run

if [ $? -eq 0 ]; then
    log_success "Renovação automática configurada corretamente"
else
    log_warn "Verifique a configuração de renovação automática"
fi

# Resumo final
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Configuração concluída!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "URL do webhook: https://${DOMAIN}/webhook"
echo ""
echo "Próximos passos:"
echo "  1. Configure o webhook na Meta Developer Console:"
echo "     - Callback URL: https://${DOMAIN}/webhook"
echo "     - Verify Token: (o mesmo do seu .env)"
echo "  2. Teste o endpoint:"
echo "     curl https://${DOMAIN}/webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=test"
echo "  3. Verifique os logs:"
echo "     pm2 logs wapp-webhook"
echo ""

