#!/bin/bash

# Script de inicialização do projeto Stellar Security Tokens
# Este script configura o ambiente e inicializa o banco de dados

set -e

echo "🚀 Inicializando projeto Stellar Security Tokens..."

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não está instalado. Por favor, instale Node.js >= 18.0.0"
    exit 1
fi

# Verificar versão do Node.js
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js versão 18 ou superior é necessária. Versão atual: $(node -v)"
    exit 1
fi

echo "✓ Node.js $(node -v) detectado"

# Verificar se o PostgreSQL está instalado
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL não está instalado. Por favor, instale PostgreSQL >= 12.0"
    exit 1
fi

echo "✓ PostgreSQL detectado"

# Verificar se o arquivo .env existe
if [ ! -f .env ]; then
    echo "📝 Criando arquivo .env a partir do .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✓ Arquivo .env criado. Por favor, configure as variáveis de ambiente."
    else
        echo "❌ Arquivo .env.example não encontrado"
        exit 1
    fi
else
    echo "✓ Arquivo .env já existe"
fi

# Instalar dependências
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências npm..."
    npm install
    echo "✓ Dependências instaladas"
else
    echo "✓ Dependências já instaladas"
fi

# Verificar conexão com o banco de dados
echo "🔌 Verificando conexão com o banco de dados..."
DB_NAME=$(grep DB_NAME .env | cut -d '=' -f2 | tr -d ' ')
DB_USER=$(grep DB_USER .env | cut -d '=' -f2 | tr -d ' ')
DB_HOST=$(grep DB_HOST .env | cut -d '=' -f2 | tr -d ' ')
DB_PORT=$(grep DB_PORT .env | cut -d '=' -f2 | tr -d ' ')

if [ -z "$DB_NAME" ]; then
    DB_NAME="stellar_tokens"
fi

# Tentar criar o banco de dados se não existir
echo "📊 Verificando banco de dados '$DB_NAME'..."
if psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "✓ Banco de dados '$DB_NAME' já existe"
else
    echo "📊 Criando banco de dados '$DB_NAME'..."
    createdb -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" "$DB_NAME" || {
        echo "⚠️  Não foi possível criar o banco de dados automaticamente."
        echo "   Por favor, crie manualmente: createdb $DB_NAME"
    }
fi

# Executar migrations
echo "🔄 Executando migrations..."
npm run migrate

echo ""
echo "✅ Inicialização concluída!"
echo ""
echo "Próximos passos:"
echo "1. Configure as chaves Stellar no arquivo .env:"
echo "   - ISSUER_SECRET_KEY"
echo "   - DISTRIBUTOR_SECRET_KEY"
echo ""
echo "2. (Opcional) Execute o seed para dados de exemplo:"
echo "   npm run seed"
echo ""
echo "3. Inicie o servidor:"
echo "   npm run dev    # Desenvolvimento"
echo "   npm start      # Produção"
echo ""

