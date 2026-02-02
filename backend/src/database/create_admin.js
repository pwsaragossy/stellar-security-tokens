import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';

// SECURITY: Prevent running this script in production with hardcoded passwords
if (process.env.NODE_ENV === 'production') {
    console.error('❌ ERROR: This script cannot be run in production environment.');
    console.error('   Use the createAdmin.js script with CLI arguments instead.');
    process.exit(1);
}
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
