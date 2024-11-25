const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const ChatHistory = require("../models/ChatbotsHistory");
const Job = require("../models/Job");
const SkillResource = require("../models/SkillResource");
const { scheduleInterview } = require("./InterviewController");

const convertToTextFormat = (data) => {
  return data
    .map((skill) => {
      let result = `${skill.skill}:\n`;
      skill.links.forEach((link, index) => {
        result += `Link ${index + 1}\n${link}\n`;
      });
      return result.trim(); // Remove the last newline
    })
    .join("\n\n"); // Separate skills with two newlines
};
const getResources = async (job_id) => {
  try {
    // Find the specific job by job_id and get the required skills and experience
    const job = await Job.findOne(
      { _id: new mongoose.Types.ObjectId(job_id) },
      { _id: 1, company_name: 1, skills_required: 1, experience_required: 1 }
    );

    if (!job) {
      return { error: "Job not found" };
    }

    const requiredSkills = job.skills_required; // Get the skills from the job document
    const experience = job.experience_required; // Get the experience_required field

    // Determine the skill level based on experience
    let level = "beginner";
    if (experience > 1 && experience <= 3) {
      level = "intermediate";
    } else if (experience > 3) {
      level = "advanced";
    }

    // Query SkillResource collection for resources based on the required skills and level
    const resources = await SkillResource.find({
      skill: { $in: requiredSkills }, // Match skills in the requiredSkills array
      level: level, // Match the determined skill level
    });

    if (resources.length === 0) {
      return { error: "No resources found for the required skills and level" };
    }

    // Format the output for each skill with its resources
    const formattedResources = resources.map((resource) => {
      const resourceLinks = resource.resources.map((r) => r.resource_link);

      return {
        skill: resource.skill,
        links: resourceLinks,
      };
    });

    return convertToTextFormat(formattedResources); // Return the formatted resources
  } catch (error) {
    console.error("Error fetching resources:", error);
    return { error: "Error fetching resources" };
  }
};

const getCompanies = async (req, res) => {
  try {
    const user_id = req?.user?.id || req?.user?._id;

    // Query to fetch all chat histories for the given user_id
    const chatHistories = await ChatHistory.find({
      user_id: new ObjectId(user_id),
    });

    // Extract unique job_ids from the chat histories
    const jobIds = [
      ...new Set(chatHistories.map((chat) => chat.job_id.toString())),
    ];

    // Fetch job details using jobIds, retrieving only _id and job_name fields
    const jobs = await Job.find(
      { _id: { $in: jobIds.map((id) => new ObjectId(id)) } },
      { _id: 1, company_name: 1 }
    );

    // Send the response with job _id and job_name
    res.status(200).json({ jobs });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getChatHistory = async (req, res) => {
  const { job_id } = req.params;
  const user_id = req?.user?.id || req?.user?._id;
  console.log(user_id, job_id);
  try {
    const chatHistory = await ChatHistory.findOne({ user_id, job_id });

    if (!chatHistory) {
      return res.status(200).json({ chatHistory: [], nextOptions: [] });
    }

    res.status(200).json({
      chatHistory: chatHistory.messages,
      nextOptions: chatHistory.nextOptions,
    });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getInterviewDateTime = async (user_id, job_id) => {
  try {
    // Fetch the document with user_id and job_id
    const chatHistory = await ChatHistory.findOne({ user_id, job_id });

    if (!chatHistory || !chatHistory.interviewDateTime) {
      return "No interview date and time found";
    }

    // Retrieve and format the interviewDateTime
    const interviewDateTime = new Date(chatHistory.interviewDateTime);

    // Format to 'YYYY-MM-DD' for date and 'HH:mm' for time
    // const date = interviewDateTime.toISOString().split("T")[0];
    // const time = interviewDateTime.toTimeString().split(" ")[0].slice(0, 5); // Extracting only HH:mm

    return interviewDateTime;
  } catch (error) {
    console.error("Error fetching interview date and time:", error);
    return null;
  }
};

// Function to save chat history
const saveChatHistory = async (
  user_id,
  job_id,
  sender,
  message,
  nextOptions = null
) => {
  try {
    // Find an existing chat history document for this user and job or create a new one
    let chatHistory = await ChatHistory.findOne({ user_id, job_id });

    if (!chatHistory) {
      chatHistory = new ChatHistory({ user_id, job_id, messages: [] });
      chatHistory.messages.push({
        sender: "Bot",
        message: "Would you like to schedule an interview?",
      });
    }

    // Append the new message to the messages array
    chatHistory.messages.push({
      sender,
      message,
    });

    // If nextOptions are provided, save them at the root level
    if (nextOptions) {
      chatHistory.nextOptions = nextOptions;
    }

    // Save the document
    await chatHistory.save();
  } catch (error) {
    console.error("Error saving chat history:", error);
  }
};

const getNextOptions = async (req, res) => {
  const { job_id, userResponseValue, userResponseText, time, date } = req.body;
  console.log(time, date);

  const user_id = req?.user?.id || req?.user?._id;

  let response;

  // Save the user response in chat history
  await saveChatHistory(user_id, job_id, "User", userResponseText);

  // Step 1: Initial Schedule Request
  if (
    userResponseValue === "schedule" ||
    userResponseValue === "reschedule" ||
    userResponseValue === "update-date"
  ) {
    response = {
      value: "input-date",
      nextMessage: "Please select a date for the interview:",
      nextOptions: [{ text: "Confirm Date", value: "input-date" }], // Add more options here if needed
    };
  } else if (
    userResponseValue === "input-date" ||
    userResponseValue === "update-time"
  ) {
    response = {
      value: "input-time",
      nextMessage: "Please enter the time for the interview:",
      nextOptions: [{ text: "Confirm Time", value: "input-time" }],
    };
  } else if (userResponseValue === "input-time") {
    const dateTimeString = `${date}T${time}:00`;
    const interviewDateTime = new Date(dateTimeString).toISOString();

    // Save interviewDateTime in the database
    await ChatHistory.updateOne(
      { user_id, job_id },
      { $set: { interviewDateTime } }
    );

    response = {
      nextMessage: `Your interview date: ${date} and time: ${time} are confirmed. Do you want to proceed?`,
      nextOptions: [
        { text: "Update Date", value: "update-date" },
        { text: "Update Time", value: "update-time" },
        { text: "Confirm", value: "confirm-schedule" },
      ],
    };
  } else if (userResponseValue === "confirm-schedule") {
    let interviewDateTime = await getInterviewDateTime(user_id, job_id);

    let link = await scheduleInterview(user_id, job_id, interviewDateTime);

    try {
      response = {
        nextMessage: `Your interview has been scheduled. Here is your meeting link: ${link}`,
        nextOptions: [
          { text: "Reschedule Interview", value: "reschedule" },
          { text: "Practice Interview", value: "practice-interview" },
        ],
      };
    } catch (error) {
      response = {
        nextMessage: `Your interview has been scheduled. Here is your meeting link: ${link}. However, we couldn't fetch the resources at this time.`,
        nextOptions: [{ text: "Reschedule Interview", value: "reschedule" }],
      };
    }
  } else if (userResponseValue === "reschedule") {
    // Logic to handle rescheduling: prompt user for a new date and time.
    response = {
      nextMessage:
        "You can reschedule the interview. Please select a new date and time:",
      nextOptions: [
        { text: "Select New Date", value: "input-date" },
        { text: "Select New Time", value: "input-time" },
      ],
    };
  } else if (userResponseValue === "practice-interview") {
    try {
      const resourcesResponse = await getResources(job_id); // Fetch the resources based on job_id
      response = {
        nextMessage: resourcesResponse,
        nextOptions: [
          { text: "Reschedule Interview", value: "reschedule" },
          { text: "Practice Interview", value: "practice-interview" },
        ],
      };
    } catch (error) {
      response = {
        nextMessage:
          "An error occurred while fetching resources. Please try again.",
        nextOptions: [
          { text: "Reschedule Interview", value: "reschedule" },
          { text: "Practice Interview", value: "practice-interview" },
        ],
      };
    }
  } else {
    response = {
      nextMessage:
        "I'm sorry, I didn't understand that. Please select an option from the list.",
      nextOptions: [
        { text: "Schedule Interview", value: "schedule" },
        { text: "Reschedule Interview", value: "reschedule" },
      ],
    };
  }

  // Save the bot response in chat history
  await saveChatHistory(
    user_id,
    job_id,
    "Bot",
    response.nextMessage,
    response.nextOptions
  );

  return res.json(response);
};

module.exports = {
  getCompanies,
  getNextOptions,
  getChatHistory,
  getResources,
};
