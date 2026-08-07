const { GoogleGenAI } = require("@google/genai")
const { z } = require("zod")
const { zodToJsonSchema } = require("zod-to-json-schema")
const puppeteer = require("puppeteer")
const fs = require("fs")
const path = require("path")
const { exec } = require("child_process")
const util = require("util")
const execPromise = util.promisify(exec)

const ai = new GoogleGenAI({
    apiKey: process.env.AI_API_KEY
})

async function generateContentWithRetry(options, maxRetries = 3, initialDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await ai.models.generateContent(options);
        } catch (error) {
            if (error.status === 503 || (error.message && error.message.includes("503"))) {
                if (attempt === maxRetries) {
                    throw error;
                }
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.warn(`Gemini API attempt ${attempt} failed with 503. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}


const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well the candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The technical question can be asked in the interview"),
        intention: z.string().describe("The intention of interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc.")
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum(["low", "medium", "high"]).describe("The severity of this skill gap, i.e. how important is this skill for the job and how much it can impact the candidate's chances")
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, e.g. data structures, system design, mock interviews etc."),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day to follow the preparation plan, e.g. read a specific book or article, solve a set of problems, watch a video etc.")
    })).describe("A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively"),
    title: z.string().describe("The title of the job for which the interview report is generated"),
})

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {


    const prompt = `Generate an interview report for a candidate with the following details:
                        Resume: ${resume}
                        Self Description: ${selfDescription}
                        Job Description: ${jobDescription}
`

    const response = await generateContentWithRetry({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(interviewReportSchema),
        }
    })

    return JSON.parse(response.text)


}



async function generatePdfFromLatex(latexContent) {
    const os = require('os');
    const tmpDir = os.tmpdir();
    const tempFileName = `resume_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempTexPath = path.join(tmpDir, `${tempFileName}.tex`);
    const tempPdfPath = path.join(tmpDir, `${tempFileName}.pdf`);

    fs.writeFileSync(tempTexPath, latexContent);

    const rootDir = path.join(__dirname, '../../');
    const tectonicPath = path.join(rootDir, 'tectonic');

    try {
        // Ensure tectonic binary has executable permissions (important for deployed environments)
        await execPromise(`chmod +x ${tectonicPath}`);

        // Vercel/Serverless environments have read-only filesystems. 
        // We must point XDG_CACHE_HOME to /tmp so Tectonic can cache packages.
        const env = { ...process.env, XDG_CACHE_HOME: path.join(tmpDir, 'tectonic_cache') };

        await execPromise(`${tectonicPath} ${tempTexPath}`, { cwd: tmpDir, env });
        const pdfBuffer = fs.readFileSync(tempPdfPath);

        if (fs.existsSync(tempTexPath)) fs.unlinkSync(tempTexPath);
        if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);

        return pdfBuffer;
    } catch (error) {
        if (fs.existsSync(tempTexPath)) fs.unlinkSync(tempTexPath);
        if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
        throw error;
    }
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
    const baseLatexPath = path.join(__dirname, '../../base_resume.tex');
    const baseLatex = fs.readFileSync(baseLatexPath, 'utf-8');

    const resumePdfSchema = z.object({
        latexLines: z.array(z.string()).describe("The modified LaTeX code of the resume, line by line. Must be a complete, compilable LaTeX document.")
    });

    const prompt = `You are an expert resume writer. I am providing you a base LaTeX resume template below.
Your task is to tailor the candidate's resume to the following job description.

Job Description: ${jobDescription}
Self Description: ${selfDescription}
Extracted Resume Text (for reference): ${resume}

Base LaTeX Template:
\`\`\`latex
${baseLatex}
\`\`\`

Instructions:
1. Modify the bullet points, summary, or projects in the Base LaTeX Template to better fit the Job Description and Self Description.
2. DO NOT change the structure, styling, geometry, or layout of the LaTeX template.
3. Keep all existing hyperlinks, formatting commands (like \\textbf, \\href), and section headers intact.
4. Output the COMPLETE, valid, and compilable LaTeX document as an array of strings in the "latexLines" field.
5. The content should be professional, ATS friendly, and not sound like it's generated by AI.
`;

    const response = await generateContentWithRetry({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: zodToJsonSchema(resumePdfSchema),
        }
    });

    const jsonContent = JSON.parse(response.text);

    const actualLatex = jsonContent.latexLines.join('\n');
    const pdfBuffer = await generatePdfFromLatex(actualLatex);

    return pdfBuffer;
}

module.exports = { generateInterviewReport, generateResumePdf }