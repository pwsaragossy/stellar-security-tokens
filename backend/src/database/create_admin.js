import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@test.com';
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const admin = await prisma.platformAdmin.upsert({
            where: { email },
            update: {
                passwordHash: hashedPassword,
                name: 'Test Admin',
                role: 'super_admin',
                isActive: true
            },
            create: {
                email,
                passwordHash: hashedPassword,
                name: 'Test Admin',
                role: 'super_admin',
                isActive: true
            },
        });
        console.log('Created/Updated admin:', admin);
    } catch (e) {
        console.error('Error creating admin:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
