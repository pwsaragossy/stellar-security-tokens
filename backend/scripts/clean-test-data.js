
import prisma from '../src/config/prisma.js';

async function main() {
    console.log('--- Database Cleanup Started ---');

    const tables = [
        'investor_webauthn_credentials',
        'investors',
        'company_user_webauthn_credentials',
        'company_users',
        'company_penalties',
        'payment_reminders',
        'offers',
        'companies',
        'token_distributions',
        'interest_payments',
        'investments',
        'tokens',
        'multisig_transactions',
        'notifications',
        'fee_logs'
    ];

    console.log('Truncating tables:', tables.join(', '));

    try {
        // Truncate all tables in one go with CASCADE to handle foreign keys
        // We explicitly exclude platform_admins to keep admin access
        const query = `TRUNCATE TABLE ${tables.map(t => `"${t}"`).join(', ')} CASCADE;`;
        await prisma.$executeRawUnsafe(query);

        console.log('--- Database Cleaned Successfully ---');
        console.log('Preserved: platform_admins, platform_admin_webauthn_credentials, system_config');
    } catch (error) {
        console.error('Error cleaning database:', error);
    } finally {
        // The singleton might already have a disconnect handler, but we do it explicitly here as well
        await prisma.$disconnect();
    }
}

main();
