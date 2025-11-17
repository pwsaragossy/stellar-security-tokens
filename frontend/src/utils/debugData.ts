/**
 * Utilitários para gerar dados válidos de teste para debug
 */

/**
 * Gera um CPF válido para testes
 */
export function generateValidCPF(): string {
  // CPF válido: 11144477735
  // Formatado: 111.444.777-35
  return '111.444.777-35';
}

/**
 * Gera um CNPJ válido para testes
 */
export function generateValidCNPJ(): string {
  // CNPJ válido: 11222333000181
  // Formatado: 11.222.333/0001-81
  return '11.222.333/0001-81';
}

/**
 * Gera um email válido único baseado em timestamp
 */
export function generateValidEmail(prefix: string = 'test'): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}${timestamp}${random}@example.com`;
}

/**
 * Gera um nome válido
 */
export function generateValidName(type: 'person' | 'company' = 'person'): string {
  if (type === 'company') {
    const companies = [
      'Tech Solutions LTDA',
      'Innovation Corp',
      'Digital Ventures SA',
      'Future Systems EIRELI',
      'Smart Business LTDA',
    ];
    return companies[Math.floor(Math.random() * companies.length)];
  }
  
  const firstNames = ['John', 'Maria', 'Carlos', 'Ana', 'Pedro', 'Julia'];
  const lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa', 'Ferreira'];
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${firstName} ${lastName}`;
}

/**
 * Gera um telefone válido formatado
 */
export function generateValidPhone(): string {
  const areaCode = ['11', '21', '31', '41', '51', '61', '71', '81', '91'];
  const number = Math.floor(10000000 + Math.random() * 90000000);
  const selectedAreaCode = areaCode[Math.floor(Math.random() * areaCode.length)];
  return `(${selectedAreaCode}) ${number.toString().slice(0, 5)}-${number.toString().slice(5)}`;
}

/**
 * Gera um endereço válido
 */
export function generateValidAddress(): string {
  const streets = ['Rua das Flores', 'Avenida Principal', 'Rua do Comércio', 'Avenida Central'];
  const numbers = Math.floor(100 + Math.random() * 900);
  const street = streets[Math.floor(Math.random() * streets.length)];
  return `${street}, ${numbers}`;
}

/**
 * Gera uma senha válida
 */
export function generateValidPassword(): string {
  return 'Test123456';
}

/**
 * Dados de debug para Investor Register
 */
export function getInvestorDebugData() {
  return {
    name: generateValidName('person'),
    email: generateValidEmail('investor'),
    document: generateValidCPF(),
    password: generateValidPassword(),
    confirmPassword: generateValidPassword(),
  };
}

/**
 * Dados de debug para Company Register
 */
export function getCompanyDebugData() {
  return {
    name: generateValidName('company'),
    cnpj: generateValidCNPJ(),
    email: generateValidEmail('company'),
    legal_representative: generateValidName('person'),
    address: generateValidAddress(),
    phone: generateValidPhone(),
  };
}

/**
 * Dados de debug para Company User Register
 */
export function getCompanyUserDebugData() {
  return {
    email: generateValidEmail('companyuser'),
    name: generateValidName('person'),
    password: generateValidPassword(),
    confirmPassword: generateValidPassword(),
    role: 'admin' as 'user' | 'admin',
  };
}

