from livekit.agents import function_tool, RunContext
import logging

logger = logging.getLogger("tools")

# Global variable to store candidate data fetched from API
CANDIDATE_DATA = None

def set_candidate_data(data):
    """Set the candidate data fetched from the API"""
    global CANDIDATE_DATA
    CANDIDATE_DATA = data
    logger.info(f"Candidate data set for: {data.get('fullName', 'Unknown') if data else 'None'}")

@function_tool()
async def getCandidateFacts(
    context: RunContext,
    query: str
) -> dict:
    """Get facts about the candidate's resume.

    Args:
        query: What to look up (e.g. "Python experience", "education", "skills", "summary")
    """
    global CANDIDATE_DATA

    if not CANDIDATE_DATA:
        logger.warning("No candidate data available")
        return {"found": False, "facts": ["Candidate data not available"]}

    query_lower = query.lower()

    # Interview insights and briefs
    if any(term in query_lower for term in ["interview", "brief", "insight", "work style", "collaboration", "career goal", "aspiration"]):
        interview_briefs = CANDIDATE_DATA.get('interviewBriefs', [])
        if interview_briefs:
            insights = []
            for session in interview_briefs:
                if session.get('interviewBrief'):
                    brief = session.get('interviewBrief')
                    # Handle both dict and string formats
                    if isinstance(brief, dict):
                        insights.append(brief)
                    else:
                        insights.append({"session": f"{session.get('jobTitle', '')} at {session.get('company', '')}", "brief": brief})

                # Also check achievements if relevant
                if "achievement" in query_lower and session.get('achievements'):
                    insights.append({"achievements": session.get('achievements')})

            if insights:
                return {"found": True, "facts": insights}

        # If no interview briefs found
        return {"found": False, "facts": ["No previous interview insights available"]}

    # Professional summary
    elif "summary" in query_lower or "about" in query_lower:
        summary = CANDIDATE_DATA.get('professionalSummary', '')
        if summary:
            return {"found": True, "facts": [summary]}
        else:
            return {"found": True, "facts": [f"{CANDIDATE_DATA.get('fullName', 'Candidate')} is a {CANDIDATE_DATA.get('jobTitle', 'professional')} with {CANDIDATE_DATA.get('totalExperience', 'several')} years of experience."]}

    # Skills
    elif "skill" in query_lower:
        skills = CANDIDATE_DATA.get('skills', [])
        if skills:
            skill_names = [skill.get('name', '') for skill in skills]
            return {"found": True, "facts": skill_names}
        else:
            return {"found": False, "facts": ["No skills information available"]}

    # Check for specific skill
    elif any(skill.get('name', '').lower() in query_lower for skill in CANDIDATE_DATA.get('skills', [])):
        matching_skills = []
        for skill in CANDIDATE_DATA.get('skills', []):
            if skill.get('name', '').lower() in query_lower:
                skill_info = f"{skill.get('name')} - {skill.get('yearsOfExp', 0)} years experience"
                if skill.get('lastUsed'):
                    skill_info += f", last used: {skill.get('lastUsed')}"
                matching_skills.append(skill_info)
        return {"found": True, "facts": matching_skills}

    # Education (note: education might not be in the profile data structure we saw)
    elif "education" in query_lower or "degree" in query_lower or "university" in query_lower:
        # Since education is not in the profile structure, we might need to extract from experiences or summary
        return {"found": False, "facts": ["Education information not available in current profile"]}

    # Experience
    elif "experience" in query_lower or "work" in query_lower or "job" in query_lower or "employment" in query_lower:
        experiences = CANDIDATE_DATA.get('experiences', [])
        if experiences:
            exp_list = []
            for exp in experiences:
                exp_info = {
                    "company": exp.get('company', 'Unknown'),
                    "role": exp.get('jobTitle', 'Unknown'),
                    "dates": f"{exp.get('startDate', '')} - {'Present' if exp.get('isCurrentRole') else exp.get('endDate', '')}",
                    "description": exp.get('description', '')
                }
                exp_list.append(exp_info)
            return {"found": True, "facts": exp_list}
        else:
            return {"found": False, "facts": ["No experience information available"]}

    # Current position
    elif "current" in query_lower or "present" in query_lower:
        current_company = CANDIDATE_DATA.get('currentCompany', '')
        job_title = CANDIDATE_DATA.get('jobTitle', '')
        if current_company or job_title:
            return {"found": True, "facts": [f"Currently {job_title} at {current_company}"]}
        else:
            return {"found": False, "facts": ["Current position information not available"]}

    # Location
    elif "location" in query_lower or "where" in query_lower:
        location = CANDIDATE_DATA.get('location', '')
        country = CANDIDATE_DATA.get('country', '')
        if location or country:
            loc_info = f"{location}"
            if country:
                loc_info += f", {country}"
            return {"found": True, "facts": [loc_info]}
        else:
            return {"found": False, "facts": ["Location information not available"]}

    # Name
    elif "name" in query_lower or "who" in query_lower:
        return {"found": True, "facts": [f"The candidate is {CANDIDATE_DATA.get('fullName', 'Unknown')}"]}

    # Check interview briefs for any other context
    else:
        # As a fallback, search interview briefs for relevant context
        interview_briefs = CANDIDATE_DATA.get('interviewBriefs', [])
        if interview_briefs:
            relevant_insights = []
            for session in interview_briefs:
                if session.get('interviewBrief'):
                    brief_str = str(session.get('interviewBrief', '')).lower()
                    # Check if query terms appear in the brief
                    if any(term in brief_str for term in query_lower.split()):
                        relevant_insights.append({
                            "from_interview": f"{session.get('jobTitle', '')} at {session.get('company', '')}",
                            "context": session.get('interviewBrief')
                        })

            if relevant_insights:
                return {"found": True, "facts": relevant_insights}

        return {"found": False, "facts": ["I couldn't find information about that specific query"]}