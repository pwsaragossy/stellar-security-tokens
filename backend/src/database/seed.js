import { Investor } from '../models/Investor.js';
import dotenv from 'dotenv';

dotenv.config();

const seedData = async () => {
  try {
    console.log('Seeding database...');

    const sampleInvestors = [
      {
        name: 'João Silva',
        email: 'joao.silva@example.com',
        document: '12345678900',
        stellarPublicKey: null,
        kycStatus: 'pending',
      },
      {
        name: 'Maria Santos',
        email: 'maria.santos@example.com',
        document: '98765432100',
        stellarPublicKey: null,
        kycStatus: 'approved',
      },
    ];

    for (const investorData of sampleInvestors) {
      try {
        const existing = await Investor.findByEmail(investorData.email);
        if (!existing) {
          await Investor.create(investorData);
          console.log(`✓ Created investor: ${investorData.name}`);
        } else {
          console.log(`- Investor already exists: ${investorData.name}`);
        }
      } catch (error) {
        console.error(`Error creating investor ${investorData.name}:`, error.message);
      }
    }

    console.log('Seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedData();

