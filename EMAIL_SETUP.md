# Configuração de Email - Stellar Security Tokens

Este guia explica como configurar o envio de emails para notificações de pagamento de juros.

## Variáveis de Ambiente Necessárias

Adicione as seguintes variáveis no seu arquivo `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@gmail.com
SMTP_PASSWORD=sua_senha_ou_app_password
SMTP_FROM=noreply@seudominio.com
```

## Provedores de Email Suportados

### 1. Gmail

**Configuração:**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@gmail.com
SMTP_PASSWORD=sua_app_password
SMTP_FROM=seu_email@gmail.com
```

**Passos:**

1. Ative a verificação em duas etapas na sua conta Google
2. Gere uma "Senha de app" (App Password):
   - Acesse: https://myaccount.google.com/apppasswords
   - Selecione "Email" e "Outro (nome personalizado)"
   - Digite "Stellar Security Tokens"
   - Copie a senha gerada (16 caracteres)
3. Use essa senha no `SMTP_PASSWORD`

**Nota:** Não use sua senha normal do Gmail. Use sempre uma App Password.

### 2. SendGrid

**Configuração:**

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASSWORD=SG.sua_api_key_aqui
SMTP_FROM=noreply@seudominio.com
```

**Passos:**

1. Crie uma conta em https://sendgrid.com
2. Vá em Settings > API Keys
3. Crie uma nova API Key com permissões de "Mail Send"
4. Copie a API Key e use no `SMTP_PASSWORD`
5. Configure um remetente verificado em Settings > Sender Authentication

### 3. Mailgun

**Configuração:**

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@seudominio.mailgun.org
SMTP_PASSWORD=sua_senha_smtp
SMTP_FROM=noreply@seudominio.com
```

**Passos:**

1. Crie uma conta em https://www.mailgun.com
2. Vá em Sending > Domain Settings
3. Use as credenciais SMTP fornecidas
4. Verifique seu domínio

### 4. Amazon SES

**Configuração:**

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=sua_access_key_id
SMTP_PASSWORD=sua_secret_access_key
SMTP_FROM=noreply@seudominio.com
```

**Passos:**

1. Configure Amazon SES no AWS Console
2. Crie credenciais SMTP em SES > SMTP Settings
3. Use as credenciais geradas
4. Verifique seu domínio ou email remetente

### 5. Outlook/Office 365

**Configuração:**

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@outlook.com
SMTP_PASSWORD=sua_senha
SMTP_FROM=seu_email@outlook.com
```

## Testando a Configuração

### Método 1: Script de Teste

Execute o script de teste de email:

```bash
node scripts/test-email.js
```

Este script tentará enviar um email de teste para o endereço configurado.

### Método 2: Via API

Após processar um pagamento de juros, os emails serão enviados automaticamente. Verifique os logs do servidor para confirmar o envio.

### Método 3: Verificar Logs

Quando o servidor inicia, você verá uma das seguintes mensagens:

**Se configurado corretamente:**
```
Email service configured successfully
```

**Se não configurado:**
```
SMTP credentials not configured. Email sending will be disabled.
```

## Troubleshooting

### Erro: "Invalid login"

- Verifique se `SMTP_USER` e `SMTP_PASSWORD` estão corretos
- Para Gmail, certifique-se de usar uma App Password, não a senha normal
- Verifique se a verificação em duas etapas está ativada (Gmail)

### Erro: "Connection timeout"

- Verifique se `SMTP_HOST` e `SMTP_PORT` estão corretos
- Verifique se há firewall bloqueando a conexão
- Tente usar `SMTP_SECURE=true` com porta 465

### Erro: "Authentication failed"

- Verifique as credenciais
- Para SendGrid, certifique-se de usar `apikey` como `SMTP_USER`
- Verifique se o remetente está verificado no provedor

### Emails não estão sendo enviados

1. Verifique os logs do servidor
2. Confirme que `SMTP_USER` e `SMTP_PASSWORD` estão configurados
3. Execute o script de teste: `node scripts/test-email.js`
4. Verifique se o email do investidor está válido no banco de dados

### Emails vão para spam

- Configure SPF, DKIM e DMARC no seu domínio
- Use um remetente verificado
- Evite palavras que parecem spam no assunto
- Configure um domínio próprio ao invés de usar Gmail/Outlook

## Desabilitar Envio de Emails

Se você não quiser enviar emails (apenas para desenvolvimento), simplesmente não configure as variáveis `SMTP_USER` e `SMTP_PASSWORD`. O sistema continuará funcionando normalmente, apenas não enviará emails.

## Segurança

- **Nunca** commite suas credenciais SMTP no Git
- Use variáveis de ambiente ou um gerenciador de secrets
- Em produção, use serviços gerenciados como AWS Secrets Manager ou Azure Key Vault
- Rotacione suas senhas/API keys regularmente

## Exemplo de Email Enviado

Quando um pagamento de juros é processado, os investidores recebem um email com:

- Nome do investidor
- Valor do pagamento em USDC
- Data do pagamento
- Hash da transação Stellar
- Link para verificar a transação no Stellar Explorer

O email é enviado em HTML formatado e também inclui uma versão em texto simples.

