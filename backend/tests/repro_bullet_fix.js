import { PaymentService } from '../src/services/payment.service.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: false });

async function test() {
    console.log('Testing processBulletPayments() without assetCode...');
    try {
        // This should no longer throw "assetCode is required"
        const result = await PaymentService.processBulletPayments();
        console.log('Result:', JSON.stringify(result, null, 2));
        console.log('Test PASSED: No error thrown.');
    } catch (error) {
        console.error('Test FAILED:', error);
        process.exit(1);
    }

    console.log('\nTesting processAllScheduledPayments()...');
    try {
        const result = await PaymentService.processAllScheduledPayments();
        console.log('Result:', JSON.stringify(result, null, 2));
        console.log('Test PASSED: No error thrown.');
    } catch (error) {
        console.error('Test FAILED:', error);
        process.exit(1);
    }
}

test().then(() => process.exit(0));
