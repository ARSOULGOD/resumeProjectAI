require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.AI_API_KEY });

(async () => {
    try {
        console.log("Testing gemini-3-flash-preview...");
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: "Say hi"
        });
        console.log("Response:", response.text);
    } catch(e) {
        console.error("Error:", e.message);
    }
})();
