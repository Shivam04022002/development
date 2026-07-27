import express from 'express';
import loginUser from '../controllers/authController.js';
import { refreshToken, validateToken } from '../controllers/authController.js';


console.log('error',loginUser);

const router = express.Router();
// Define the login route
router.post('/login', loginUser);
// Token refresh route
router.post('/refresh', refreshToken);
// Token validation route (lightweight check)
router.post('/validate', validateToken);
// Define the updateFiles route
router.get('/step', (req, res) => {
    res.status(200).json({ message: 'Step 1 completed' });
});

//define the put route
router.put('/step', (req, res) => {
    const { step } = req.body;
    if (step === 1) {
        res.status(200).json({ message: 'Step 1 updated successfully' });
    } else if (step === 2) {
        res.status(200).json({ message: 'Step 2 updated successfully' });
    }
    else if (step === 3) {
        res.status(200).json({ message: 'Step 3 updated successfully' });
    }
    else if (step === 4) {
        res.status(200).json({ message: 'Step 4 updated successfully' });
    } else if (step === 5) {
        res.status(200).json({ message: 'Step 5 updated successfully' });
    } else if (step === 6) {
        res.status(200).json({ message: 'Step 6 updated successfully' });
    } else if (step === 7) {
        res.status(200).json({ message: 'Step 7 updated successfully' });
    } else if (step === 8) {
        res.status(200).json({ message: 'Step 8 updated successfully' });
    } else {
        res.status(400).json({ message: 'Invalid step' });
    }
});




// Export the router
export default router;