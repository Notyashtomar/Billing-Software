// Reset and test super admin creation from scratch
const mongoose = require('mongoose');
const readline = require('readline');
const { Logger } = require('@nestjs/common');
require('dotenv').config();

const logger = new Logger('ResetSuperadmin');

const AdminSchema = new mongoose.Schema({
  name: String,
  userid: String,
  email: { type: String, unique: true },
  password: String,
  role: String,
}, { timestamps: true, collection: 'admin' });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function resetAndTest() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/fris-db';
    await mongoose.connect(mongoUri);
    logger.log('Connected to MongoDB');
    
    const Admin = mongoose.model('Admin', AdminSchema);
    
    // Show current state
    // ?done
    const currentSuperAdmin = await Admin.findOne({ userid: 'super_admin_001' });
    
    if (currentSuperAdmin) {
      logger.log('Super Admin already exists:');
      logger.log(`   UserID: ${currentSuperAdmin.userid}`);
      logger.log(`   Email: ${currentSuperAdmin.email}`);
      logger.log(`   Created: ${currentSuperAdmin.createdAt}`);
      
      rl.question('\n❓ Do you want to DELETE it and test creation fresh? (yes/no): ', async (answer) => {
        if (answer.toLowerCase() === 'yes') {
          // Delete existing super admin
          await Admin.deleteOne({ userid: 'super_admin_001' });
          logger.log('Super Admin deleted!');
          
          logger.log('Now restart your server with: npm run start:dev');
          logger.log('The AdminBootstrapService will create a new super admin');
          logger.log('Watch for: Super Admin created in admin collection');
        } else {
          logger.log('Super Admin kept as is. Ready to use!');
        }
        
        await mongoose.disconnect();
        rl.close();
      });
    } else {
      logger.log('No super admin exists yet');
      logger.log('Start your server with: npm run start:dev');
      logger.log('The AdminBootstrapService will create the super admin automatically');
      
      await mongoose.disconnect();
      rl.close();
    }
    
  } catch (error) {
    logger.error(error?.message || String(error));
    rl.close();
  }
}

resetAndTest();
