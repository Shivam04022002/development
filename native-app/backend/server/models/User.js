import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userShema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true},
    password: {
        type: String,
        required: true,},
         UserId: String,//userId pattern for dealer 
      name: String,
      District: String,
      Branch: String,
      branchName: String,
      Contact: String,
      mobileNumber: String,
      pushToken: String, // Expo push notification token
      profilePic: String,
      profilePicture: { type: String, default: "" },
      lastLoginAt: { type: Date, default: null },
      lastSeenAt: { type: Date, default: null },
      isActive: { type: Boolean, default: true },
});

userShema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password= await bcrypt.hash(this.password, 10);   
    next();

});

userShema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password,);
};

export default mongoose.model("User", userShema);   
