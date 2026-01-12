
import prisma from '../src/config/prisma.js';

const walletAddress = 'CA2BDJJCZFJBBY2P4CBMM5DRNZSHVHTVDPX3BUNDZ3LYEDYJ5DRJTJYF';

async function main() {
    console.log(`Searching for wallet: ${walletAddress}`);

    const investor = await prisma.investor.findFirst({
        where: { stellarContractId: walletAddress }
    });

    if (investor) {
        console.log('Found Investor:', investor.id, investor.name);
        return;
    }

    const company = await prisma.company.findFirst({
        where: { stellarContractId: walletAddress }
    });

    if (company) {
        console.log('Found Company:', company.id, company.name);
        return;
    }

    console.log('Not found in DB.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
