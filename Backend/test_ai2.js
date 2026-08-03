require('dotenv').config();
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { GoogleGenAI } = require("@google/genai");
const fs = require('fs');

const ai = new GoogleGenAI({ apiKey: process.env.AI_API_KEY });

(async () => {
    try {
        const baseLatex = fs.readFileSync('base_resume.tex', 'utf-8');
        const resumePdfSchema = z.object({
            latex: z.string()
        });
        const prompt = `Output the following latex exactly but in the latex field:\n\n${baseLatex.substring(0, 100)}`;
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(resumePdfSchema),
            }
        });
        const json = JSON.parse(response.text);
        console.log("Raw string length:", json.latex.length);
        console.log("First 100 chars:");
        console.log(json.latex.substring(0, 100));
        console.log("Contains literal \\n?", json.latex.includes('\\n'));
    } catch(e) {
        console.error(e);
    }
})();
