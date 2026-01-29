import prisma from './src/config/prisma.js';

async function test() {
    try {
        console.log('Testing prisma.offer.findMany...');
        const offers = await prisma.offer.findMany({
            take: 1,
            include: {
                company: true,
                requester: true,
                tokens: true
            }
        });
        console.log('Success!', offers.length);
    } catch (error) {
        console.error('Error caught in test script:');
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

test();
