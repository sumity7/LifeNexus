import mongoose from 'mongoose';

mongoose.set('strictQuery', true);
mongoose.set('toJSON', { versionKey: false });

export async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
