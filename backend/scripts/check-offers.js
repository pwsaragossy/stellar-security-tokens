
import { PrismaClient } from '../prisma/generated/prisma/index.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
const prisma = new PrismaClient();

async function main() {
    const offers = await prisma.offer.findMany({
        select: {
            id: true,
            assetCode: true,
            offerName: true,
            totalSupply: true,
            status: true
        }
    });
    console.log(JSON.stringify(offers, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
