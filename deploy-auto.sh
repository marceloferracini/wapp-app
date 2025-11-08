#!/bin/bash

###############################################################################
# Script de Deploy Automático - WAPP Webhook
# Versão sem interatividade (para CI/CD ou automação)
###############################################################################

set -e  # Parar em caso de erro

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_NAME="wapp-webhook"
BRANCH="main"

function log_step() {
  local step="$1"
  local message="$2"
  echo -e "${BLUE}[${step}]${NC} ${message}"
}

log_step "1/5" "Atualizando código do GitHub..."
git pull origin "$BRANCH"

log_step "2/5" "Instalando dependências de produção..."
npm ci --production --quiet

log_step "3/5" "Sincronizando variáveis de ambiente (.env)..."
if [ ! -f .env ]; then
  echo -e "${RED}Arquivo .env não encontrado! Crie ou copie antes de continuar.${NC}"
  exit 1
fi

log_step "4/5" "Reiniciando PM2 (${APP_NAME})..."
pm2 restart "$APP_NAME"

log_step "5/5" "Verificando status do processo..."
pm2 list | grep "$APP_NAME"

echo -e "${GREEN}✓${NC} Deploy concluído com sucesso!"
