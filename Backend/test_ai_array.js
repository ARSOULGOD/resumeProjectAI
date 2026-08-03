require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');
const fs = require('fs');

const ai = new GoogleGenAI({ apiKey: process.env.AI_API_KEY });

(async () => {
    try {
        const baseLatex = fs.readFileSync('base_resume.tex', 'utf-8');
        const resumePdfSchema = z.object({
            latexLines: z.array(z.string()).describe("The modified LaTeX code of the resume, line by line.")
        });
        const prompt = `Output the following latex exactly but in the latexLines field:\n\n${baseLatex.substring(0, 300)}`;
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(resumePdfSchema),
            }
        });
        const json = JSON.parse(response.text);
        console.log("Returned lines count:", json.latexLines.length);
        console.log("Joined:");
        console.log(json.latexLines.join('\n'));
    } catch(e) {
        console.error(e);
    }
})();
