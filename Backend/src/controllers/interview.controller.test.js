import path from "path"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import express from "express"
import request from "supertest"
import { beforeEach, describe, expect, test } from "vitest"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const RESUME_PDF = path.join(__dirname, "..", "__fixtures__", "sample_resume.pdf")

// This codebase is CommonJS, and `vi.mock` does not intercept `require`. The
// controller destructures its service at load time, so the substitution has to
// happen on module.exports *before* the controller is required.
const aiService = require("../services/ai.service")
const InterviewReport = require("../models/interviewReport.model")

// Mirrors the full shape of the Zod schema in services/ai.service.js — a partial
// fixture would pass here and still fail mongoose validation in production.
const AI_REPORT = {
    matchScore: 72,
    title: "Senior Backend Engineer",
    technicalQuestions: [ { question: "How do you shard MongoDB?", intention: "Depth on data modelling", answer: "Discuss shard keys and balancing." } ],
    behavioralQuestions: [ { question: "Describe a production outage you owned.", intention: "Ownership", answer: "Use STAR, focus on the remediation." } ],
    skillGaps: [ { skill: "Kubernetes", severity: "medium" } ],
    preparationPlan: [ { day: 1, focus: "System design", tasks: [ "Read DDIA ch. 6" ] } ]
}

// Gemini is an external network call — substituted. The recorded arguments pin
// down what the controller feeds it in each branch.
let aiCalls = []
aiService.generateInterviewReport = async (args) => {
    aiCalls.push(args)
    return structuredClone(AI_REPORT)
}

// Mongo is external — persistence is faked, but the real schema still runs so
// required-field validation and casting stay honest.
InterviewReport.create = async (doc) => {
    const created = new InterviewReport(doc)
    await created.validate()
    return created
}

const upload = require("../middlewares/file.middleware")
const { generateInterViewReportController } = require("./interview.controller")

function buildApp() {
    const app = express()
    // auth is covered by its own middleware; these tests are scoped to the controller
    app.post(
        "/api/interview",
        (req, _res, next) => {
            req.user = { id: "68f0000000000000000000aa" }
            next()
        },
        upload.single("resume"),
        generateInterViewReportController
    )
    return app
}

describe("generateInterViewReportController", () => {
    beforeEach(() => {
        aiCalls = []
    })

    // Breaks if the controller dereferences req.file.buffer unconditionally.
    test("generates a report when a self description is given and no resume is uploaded", async () => {
        const res = await request(buildApp())
            .post("/api/interview")
            .field("selfDescription", "Six years building Node APIs at fintech startups.")
            .field("jobDescription", "Senior Backend Engineer, distributed systems.")

        expect(res.status).toBe(201)
        expect(res.body.interviewReport.title).toBe("Senior Backend Engineer")
        expect(res.body.interviewReport.selfDescription).toBe("Six years building Node APIs at fintech startups.")
        expect(res.body.interviewReport.resume).toBeUndefined()
        expect(aiCalls[ 0 ].resume).toBeUndefined()
    })

    // Breaks if the controller stops validating that at least one profile source exists.
    test("rejects a submission carrying neither a resume nor a self description", async () => {
        const res = await request(buildApp())
            .post("/api/interview")
            .field("jobDescription", "Senior Backend Engineer, distributed systems.")

        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/resume|self description/i)
        expect(aiCalls).toHaveLength(0)
    })

    // Breaks if a blank self description is treated as a usable profile source.
    test("rejects a whitespace-only self description with no resume", async () => {
        const res = await request(buildApp())
            .post("/api/interview")
            .field("selfDescription", "   ")
            .field("jobDescription", "Senior Backend Engineer, distributed systems.")

        expect(res.status).toBe(400)
        expect(aiCalls).toHaveLength(0)
    })

    // Breaks if the fix drops PDF parsing, or hands the raw buffer to the AI.
    test("extracts text from an uploaded resume PDF", async () => {
        const res = await request(buildApp())
            .post("/api/interview")
            .field("jobDescription", "Senior Backend Engineer, distributed systems.")
            .attach("resume", RESUME_PDF)

        expect(res.status).toBe(201)
        expect(res.body.interviewReport.resume).toContain("Jane Doe")
        expect(aiCalls[ 0 ].resume).toContain("Kubernetes")
    })
})
