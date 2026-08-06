# Resume Project AI 🚀

A full-stack, AI-powered application designed to help candidates prepare for interviews and perfectly tailor their resumes to specific job descriptions. Leveraging the power of Google Gemini AI, this tool bridges the gap between generic applications and highly targeted, ATS-friendly resumes.

---

## 🌟 Key Features

| Feature | Description |
| :--- | :--- |
| **🧠 AI Interview Prep** | Upload your current resume and a job description to receive a comprehensive fit report. |
| **🎯 Tailored Resume Generation** | Generate a beautifully formatted, highly-targeted PDF resume using a professional LaTeX template. |
| **📈 Match Scoring** | Get a compatibility score (0-100) indicating how well your profile aligns with the target role. |
| **🗣️ Question Prediction** | Receive anticipated technical and behavioral interview questions with intentions and sample answers. |
| **🗓️ Personalized Study Plan** | Obtain a day-by-day actionable preparation plan tailored to your specific skill gaps. |

---

## 🛠️ Tech Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | React 19, Vite, React Router 7, SCSS |
| **Backend** | Node.js, Express 5, Mongoose (MongoDB) |
| **AI Integration** | Google Gen AI (Gemini), Zod (Schema Validation) |
| **Document Processing** | `pdf-parse` (Reading), `multer` (Uploads), `tectonic` (LaTeX to PDF compilation) |

---

## ⚙️ How It Works (The Pipelines)

The application operates via two primary pipelines:

### 1. The Interview Preparation Pipeline
1. **Input:** The user uploads their current Resume (PDF) and a target Job Description.
2. **Parsing:** The backend uses `multer` to handle the file upload in memory and `pdf-parse` to extract the raw text from the resume.
3. **AI Processing:** The extracted resume text, user self-description, and job description are sent to Google Gemini via the `ai.service`.
4. **Structured Output:** Gemini returns a strictly structured JSON response (enforced by Zod schemas) containing match scores, skill gaps, predicted questions, and a prep plan.
5. **Storage & Display:** The report is saved to MongoDB and rendered dynamically on the frontend study dashboard.

### 2. The Resume Tailoring Pipeline (LaTeX)
1. **Input:** The user provides their base details, a self-description, and the target Job Description.
2. **Prompt Construction:** The backend loads a premium, ATS-friendly Base LaTeX Template (`base_resume.tex`).
3. **AI Tailoring:** Gemini is instructed to modify *only* the content (summaries, bullet points, impact metrics) to match the job description, while strictly preserving the complex LaTeX layout, styling, and hyperlinks.
4. **Compilation:** The AI-generated `.tex` content is saved to a temporary file and compiled locally using the fast `tectonic` LaTeX engine.
5. **Delivery:** The highly-targeted, professional PDF is streamed directly back to the user for download, bypassing the need to ever store sensitive resume files permanently on the server.

---
