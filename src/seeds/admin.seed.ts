import AdminModel from '@/models/admin.model';
import { Admin } from '@/types/admin.types';

async function seedAdmin() {
    const staffAccounts: Partial<Admin>[] = [
        {
            firstName: 'Sadiq',
            lastName: 'Mustapha',
            email: 'sadiq@energiease.ng',
            password: 'EnergiEase2026!',
            role: 'superadmin',
            permissions: [
                'view_analytics',
                'view_orders',
                'manage_orders',
                'send_tokens',
                'view_customers',
                'view_accounting',
                'manage_admins',
            ],
        },
        {
            firstName: 'Customer',
            lastName: 'Support',
            email: 'support@energiease.ng',
            password: 'EnergiEase2026!',
            role: 'support',
            permissions: [
                'view_orders',
                'manage_orders',
                'send_tokens',
                'view_customers',
            ],
        },
        {
            firstName: 'Finance',
            lastName: 'Accounting',
            email: 'accounting@energiease.ng',
            password: 'EnergiEase2026!',
            role: 'accounting',
            permissions: [
                'view_analytics',
                'view_orders',
                'view_accounting',
            ],
        },
    ];

    try {
        for (const account of staffAccounts) {
            const existingAdmin = await AdminModel.findOne({ email: account.email });
            if (!existingAdmin) {
                const admin = new AdminModel(account);
                await admin.save();
                console.log(`Staff account created successfully: ${account.email} (${account.role})`);
            } else {
                console.log(`Staff account ${account.email} already exists.`);
            }
        }
    } catch (error) {
        console.error('Error creating staff accounts:', error);
    }
}

export default seedAdmin;