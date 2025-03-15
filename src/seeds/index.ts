import seedAdmin from './admin.seed';

async function runSeeds() {
    console.log('Running seeds...');

    await seedAdmin();

    console.log('Seeds completed.');
}

export default runSeeds;