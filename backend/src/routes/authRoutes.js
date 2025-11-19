import express from 'express';
import { body } from 'express-validator';
import { validate } from './middleware/validator.js';
import { generateToken } from './middleware/auth.js';
import { Investor } from './models/Investor.js';

const router = express.Router();

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').optional().isString().withMessage('Password must be a string'),
  validate,
];

router.post('/login', loginValidation, async (req, res, next) => {
  try {
    const { email } = req.body;

    const investor = await Investor.findByEmail(email);
    if (!investor) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    const token = generateToken({
      id: investor.id,
      email: investor.email,
      role: 'investor',
    });

    res.json({
      success: true,
      data: {
        token,
        investor: {
          id: investor.id,
          name: investor.name,
          email: investor.email,
          kycStatus: investor.kycStatus,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

