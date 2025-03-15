import AdminModel from '@/models/admin.model';
import { Admin } from '@/types/admin.types';

async function seedAdmin() {
    const demoAdmin: Partial<Admin> = {
        firstName: 'Collins',
        lastName: 'Ogbuzuru',
        email: 'collinsogbuzuru@yopmail.com',
        password: 'Lacem1234!',
        role: 'superadmin',
        permissions: ['manage_admins', 'manage_users', 'manage_credit_limit', 'manage_card'],
    };

    try {
        const existingAdmin = await AdminModel.findOne({ email: demoAdmin.email });
        if (existingAdmin) {
            console.log('Demo admin account already exists.');
            return;
        }

        const admin = new AdminModel(demoAdmin);
        await admin.save();

        console.log('Demo admin account created successfully:', admin);
    } catch (error) {
        console.error('Error creating demo admin account:', error);
    }
}

export default seedAdmin;