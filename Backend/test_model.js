require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.AI_API_KEY });

(async () => {
    try {
        console.log("Testing gemini-1.5-flash...");
        const response = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: "Say hi"
        });
        console.log("Response:", response.text);
    } catch(e) {
        console.error("Error:", e);
    }
})();
