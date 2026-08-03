import { getAllInterviewReports, generateInterviewReport, getInterviewReportById, generateResumePdf } from "../services/interview.api"
import { useContext, useEffect } from "react"
import { InterviewContext } from "../interview.context"
import { useParams } from "react-router"


/**
 * @description Pull a displayable message out of an axios error. Blob responses
 * (the resume pdf download) carry the server's json body as an opaque Blob, so
 * it has to be read back as text before the message is reachable.
 */
const toErrorMessage = async (error, fallback) => {
    const data = error?.response?.data

    if (data instanceof Blob) {
        try {
            return JSON.parse(await data.text())?.message || fallback
        } catch {
            return fallback
        }
    }

    return data?.message || error?.message || fallback
}


export const useInterview = () => {

    const context = useContext(InterviewContext)
    const { interviewId } = useParams()

    if (!context) {
        throw new Error("useInterview must be used within an InterviewProvider")
    }

    const { loading, setLoading, report, setReport, reports, setReports, error, setError } = context

    const generateReport = async ({ jobDescription, selfDescription, resumeFile }) => {
        setLoading(true)
        setError(null)
        let interviewReport = null
        try {
            const response = await generateInterviewReport({ jobDescription, selfDescription, resumeFile })
            interviewReport = response?.interviewReport ?? null

            // a 2xx with no report is still a failure — fall through to the catch so that
            // exactly one of `report` / `error` is ever populated, and no screen can hang
            if (!interviewReport) {
                throw new Error("The server did not return an interview plan.")
            }

            setReport(interviewReport)
        } catch (error) {
            console.error(error)
            setReport(null)
            setError(await toErrorMessage(error, "Could not generate your interview plan. Please try again."))
        } finally {
            setLoading(false)
        }

        return interviewReport
    }

    const getReportById = async (interviewId) => {
        setLoading(true)
        setError(null)
        let interviewReport = null
        try {
            const response = await getInterviewReportById(interviewId)
            interviewReport = response?.interviewReport ?? null

            if (!interviewReport) {
                throw new Error("This interview plan could not be found.")
            }

            setReport(interviewReport)
        } catch (error) {
            console.error(error)
            setReport(null)
            setError(await toErrorMessage(error, "Could not load this interview plan."))
        } finally {
            setLoading(false)
        }
        return interviewReport
    }

    const getReports = async () => {
        setLoading(true)
        setError(null)
        let interviewReports = []
        try {
            const response = await getAllInterviewReports()
            interviewReports = response?.interviewReports ?? []
            setReports(interviewReports)
        } catch (error) {
            console.error(error)
            setReports([])
            setError(await toErrorMessage(error, "Could not load your interview plans."))
        } finally {
            setLoading(false)
        }

        return interviewReports
    }

    const getResumePdf = async (interviewReportId) => {
        setLoading(true)
        setError(null)
        try {
            const response = await generateResumePdf({ interviewReportId })

            if (!response) {
                throw new Error("The server returned an empty resume file.")
            }

            const url = window.URL.createObjectURL(new Blob([response], { type: "application/pdf" }))
            const link = document.createElement("a")
            link.href = url
            link.setAttribute("download", `resume_${interviewReportId}.pdf`)
            document.body.appendChild(link)
            link.click()
            link.remove()
            // deferred so the browser has committed to the download before the blob url is released
            setTimeout(() => window.URL.revokeObjectURL(url), 0)
        }
        catch (error) {
            console.error(error)
            setError(await toErrorMessage(error, "Could not download your resume. Please try again."))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (interviewId) {
            getReportById(interviewId)
        } else {
            getReports()
        }
    }, [interviewId])

    return { loading, report, reports, error, generateReport, getReportById, getReports, getResumePdf }

}
