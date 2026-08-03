require('dotenv').config();
const { generateResumePdf } = require('./src/services/ai.service');

(async () => {
    try {
        console.log("Testing generation...");
        await generateResumePdf({
            resume: "Test Resume text",
            selfDescription: "Software engineer",
            jobDescription: "Senior dev"
        });
        console.log("Done");
    } catch(e) {
        console.error("Error:", e);
    }
})();
