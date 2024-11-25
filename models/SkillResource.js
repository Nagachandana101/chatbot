const mongoose = require("mongoose");

// Define the schema for each resource item
const ResourceSchema = new mongoose.Schema({
  resource_link: { type: String, required: true },
  resource_type: { type: String, required: true },
  // Add any other fields if needed
});

// Define the main schema for skills with resources
const SkillResourceSchema = new mongoose.Schema(
  {
    skill: { type: String, required: true },
    level: { type: String, required: true },
    resources: [ResourceSchema], // Embed the ResourceSchema as an array
  },
  {
    collection: "skills_resources", // Explicitly specify the collection name if needed
  }
);

// Export the model
const SkillResource = mongoose.model("SkillResource", SkillResourceSchema);

module.exports = SkillResource;
