import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkMongoDBConfig() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment variables');
      process.exit(1);
    }

    console.log('📋 MongoDB Configuration Check\n');
    console.log('Connection String:', mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Hide credentials
    
    // Parse connection string
    const uriParts = mongoUri.match(/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@([^\/]+)\/(.+)/);
    if (uriParts) {
      const [, isSrv, username, , host, database] = uriParts;
      console.log('  - Protocol:', isSrv ? 'mongodb+srv (Atlas)' : 'mongodb');
      console.log('  - Host:', host);
      console.log('  - Database:', database);
      console.log('  - Username:', username);
    }

    console.log('\n🔌 Connecting to MongoDB...');
    
    // Connect with options to check replica set
    const connection = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log('✅ Connected successfully!');
    console.log(`  - Host: ${connection.connection.host}`);
    console.log(`  - Port: ${connection.connection.port}`);
    console.log(`  - Database: ${connection.connection.name}`);

    // Check MongoDB version (if admin access available)
    try {
      const adminDb = connection.connection.db.admin();
      const serverStatus = await adminDb.serverStatus();
      console.log(`  - MongoDB Version: ${serverStatus.version}`);
    } catch (versionError) {
      console.log(`  - MongoDB Version: Unable to check (admin access required)`);
    }

    // Check if replica set is configured
    // MongoDB Atlas always has replica set, so we'll test transaction directly
    let replicaSetStatus = null;
    let hasReplicaSet = false;
    
    // Check connection string for Atlas (mongodb+srv)
    const isAtlas = mongoUri.includes('mongodb+srv://');
    if (isAtlas) {
      console.log('\n✅ MongoDB Atlas Detected');
      console.log('   MongoDB Atlas always uses replica sets.');
      hasReplicaSet = true;
    } else {
      // For non-Atlas, try to check replica set status
      try {
        const adminDb = connection.connection.db.admin();
        replicaSetStatus = await adminDb.command({ replSetGetStatus: 1 });
        console.log('\n✅ Replica Set Detected!');
        console.log(`  - Replica Set Name: ${replicaSetStatus.set}`);
        console.log(`  - Members: ${replicaSetStatus.members.length}`);
        const primaryMember = replicaSetStatus.members.find((m) => m.stateStr === 'PRIMARY');
        console.log(`  - Primary: ${primaryMember ? primaryMember.name : 'N/A'}`);
        hasReplicaSet = true;
      } catch (replicaError) {
        if (replicaError.codeName === 'NotYetInitialized') {
          console.log('\n⚠️  Replica Set Not Initialized');
          console.log('   MongoDB is running but replica set is not configured.');
          console.log('   Transactions require a replica set or sharded cluster.');
        } else if (replicaError.codeName === 'NoReplicationEnabled') {
          console.log('\n⚠️  Replication Not Enabled');
          console.log('   This is a standalone MongoDB instance.');
          console.log('   Transactions require a replica set or sharded cluster.');
        } else {
          console.log('\n⚠️  Could not check replica set status:', replicaError.message);
          console.log('   Will test transaction capability directly...');
        }
      }
    }

    // Check connection options
    const connectionOptions = connection.connection.options || {};
    console.log('\n📊 Connection Options:');
    console.log(`  - Max Pool Size: ${connectionOptions.maxPoolSize || 'default'}`);
    console.log(`  - Min Pool Size: ${connectionOptions.minPoolSize || 'default'}`);
    console.log(`  - Server Selection Timeout: ${connectionOptions.serverSelectionTimeoutMS || 'default'}ms`);

    // Test transaction capability
    console.log('\n🧪 Testing Transaction Capability...');
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      console.log('  ✅ Transaction started successfully');
      
      // Try a simple operation within transaction
      const testCollection = connection.connection.db.collection('_transaction_test');
      await testCollection.insertOne({ test: true, timestamp: new Date() }, { session });
      await testCollection.deleteOne({ test: true }, { session });
      
      await session.abortTransaction();
      console.log('  ✅ Transaction aborted successfully');
      console.log('\n✅ Transaction support is WORKING!');
      console.log('   Your MongoDB configuration supports transactions.');
      console.log('   The stock management improvements will work correctly.');
    } catch (txError) {
      if (txError.message && txError.message.includes('Transaction numbers are only allowed on a replica set')) {
        console.log('  ❌ Transaction test failed: Replica set not configured');
        console.log('\n❌ Transactions are NOT SUPPORTED with current configuration');
        console.log('\n📝 To enable transactions, you need to:');
        console.log('   1. Set up a MongoDB Replica Set (recommended for development)');
        console.log('   2. Or use MongoDB Atlas (already has replica set)');
        console.log('   3. Or use a Sharded Cluster');
        console.log('\n⚠️  Note: Without transactions, stock management will still work');
        console.log('   but may have race condition issues under high load.');
      } else {
        console.log('  ❌ Transaction test failed:', txError.message);
        console.log('   Error code:', txError.code || 'N/A');
        console.log('   Error codeName:', txError.codeName || 'N/A');
      }
    } finally {
      session.endSession();
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('   MongoDB server is not running or not accessible');
    } else if (error.message.includes('authentication failed')) {
      console.error('   Authentication failed. Check username and password.');
    } else if (error.message.includes('timeout')) {
      console.error('   Connection timeout. Check network and MongoDB server.');
    }
    process.exit(1);
  }
}

checkMongoDBConfig();

