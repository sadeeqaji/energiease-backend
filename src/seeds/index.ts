import mongoose from 'mongoose';
import { env } from '@/config';
import seedAdmin from './admin.seed';

async function runSeeds() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(env.MONGODB_URI);
  console.log('Running seeds...');

  await seedAdmin();

  console.log('Seeds completed successfully.');
  await mongoose.disconnect();
}

if (require.main === module || process.argv[1]?.includes('seeds')) {
  runSeeds().catch((err) => {
    console.error('Seed execution error:', err);
    process.exit(1);
  });
}

export default runSeeds;