import bcrypt from 'bcryptjs';
import * as userModel from '../../models/user.model.js';
import * as mailService from '../services/mailService.js'

export async function resetPassword(id) {
    const defaultPassword = '123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Get user info to send email
    const user = await userModel.findById(id);

    await userModel.update(id, {
        password_hash: hashedPassword,
        updated_at: new Date()
    });

    // Send email notification to user
    if (user && user.email) {
        try {
            await mailService.notifyPasswordReset(user, defaultPassword)
        } catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
            // Continue even if email fails - password is still reset
        }
    }
}