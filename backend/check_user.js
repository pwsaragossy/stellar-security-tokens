
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const investor = await prisma.investor.findUnique({
        where: { email: 'investor@example.com' }
    });
    console.log(investor ? 'Investor exists' : 'Investor missing');
}
check();
