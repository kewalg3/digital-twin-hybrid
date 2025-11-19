from livekit.agents import RunContext
import logging
import time

logger = logging.getLogger("experience_tools")

# Experience-specific tool for Experience Enhancement interviews
# Optimized for recruiter perspective asking about candidate's work history
async def process_candidate_query(
    context: RunContext,
    query: str,
    candidate_data: dict = None
) -> dict:
    """Process recruiter queries about the candidate's resume for experience interviews.

    Args:
        context: LiveKit RunContext
        query: What to look up (e.g. "most recent role", "company", "position", "work history")
        candidate_data: The candidate's profile data
    """
    # Use the passed candidate data
    CANDIDATE_DATA = candidate_data
    JOB_DATA = None  # Not used in experience interviews

    # Log tool usage for monitoring with timing
    tool_start = time.time()
    logger.info(f"[EXPERIENCE_TOOL] getCandidateFacts query={query!r}")
    logger.info(f"[LAT-TOOL] Tool started at {tool_start:.3f}")

    if not CANDIDATE_DATA:
        logger.warning("No candidate data available")
        return {"found": False, "facts": ["Candidate data not available"]}

    query_lower = query.lower()

    # Define result variable
    result = None

    # Professional summary
    if "summary" in query_lower or "about" in query_lower:
        summary = CANDIDATE_DATA.get('professionalSummary', '')
        if summary:
            logger.info(f"[EXPERIENCE_TOOL] Result: Returning professional summary")
            result = {"found": True, "facts": [summary]}
        else:
            logger.info(f"[EXPERIENCE_TOOL] Result: Generated summary from profile data")
            result = {"found": True, "facts": [f"{CANDIDATE_DATA.get('fullName', 'Candidate')} is a {CANDIDATE_DATA.get('jobTitle', 'professional')} with {CANDIDATE_DATA.get('totalExperience', 'several')} years of experience."]}

    # Work Experience - Optimized for recruiter queries
    elif any(term in query_lower for term in ["experience", "work", "employment", "role", "position", "company", "recent", "current", "job", "career", "history"]):
        experiences = CANDIDATE_DATA.get('experiences', [])
        if experiences:
            exp_list = []
            for exp in experiences:
                # Ensure exp is a dictionary, not a string
                if isinstance(exp, dict):
                    exp_info = {
                        "company": exp.get('company', 'Unknown'),
                        "role": exp.get('jobTitle', 'Unknown'),
                        "dates": f"{exp.get('startDate', '')} - {'Present' if exp.get('isCurrentRole') else exp.get('endDate', '')}",
                        "description": exp.get('description', ''),
                        "location": exp.get('location', ''),
                        "isCurrentRole": exp.get('isCurrentRole', False)
                    }
                    exp_list.append(exp_info)
                else:
                    # Handle case where exp is a string or unexpected type
                    logger.warning(f"Unexpected experience format: {type(exp)} - {exp}")
                    exp_list.append({"company": "Unknown", "role": str(exp), "dates": "", "description": "", "location": "", "isCurrentRole": False})

            # Sort by date (most recent first) - current role first, then by start date
            exp_list.sort(key=lambda x: (not x.get('isCurrentRole', False), x.get('dates', '')), reverse=True)

            logger.info(f"[EXPERIENCE_TOOL] Result: Found {len(exp_list)} work experiences")
            result = {"found": True, "facts": exp_list}
        else:
            result = {"found": False, "facts": ["No experience information available"]}

    # Skills
    elif "skill" in query_lower:
        skills = CANDIDATE_DATA.get('skills', [])
        if skills:
            skill_names = [skill.get('name', '') for skill in skills]
            logger.info(f"[EXPERIENCE_TOOL] Result: Found {len(skill_names)} skills")
            result = {"found": True, "facts": skill_names}
        else:
            logger.info(f"[EXPERIENCE_TOOL] Result: No skills found")
            result = {"found": False, "facts": ["No skills information available"]}

    # Check for specific skill
    elif any(skill.get('name', '').lower() in query_lower for skill in CANDIDATE_DATA.get('skills', [])):
        matching_skills = []
        for skill in CANDIDATE_DATA.get('skills', []):
            if skill.get('name', '').lower() in query_lower:
                skill_info = f"{skill.get('name')} - {skill.get('yearsOfExp', 0)} years experience"
                if skill.get('lastUsed'):
                    skill_info += f", last used: {skill.get('lastUsed')}"
                matching_skills.append(skill_info)
        logger.info(f"[EXPERIENCE_TOOL] Result: Found {len(matching_skills)} matching skills")
        result = {"found": True, "facts": matching_skills}

    # Education
    elif "education" in query_lower or "degree" in query_lower or "university" in query_lower:
        result = {"found": False, "facts": ["Education information not available in current profile"]}

    # Location
    elif "location" in query_lower or "where" in query_lower:
        location = CANDIDATE_DATA.get('location', '')
        country = CANDIDATE_DATA.get('country', '')
        if location or country:
            loc_info = f"{location}"
            if country:
                loc_info += f", {country}"
            result = {"found": True, "facts": [loc_info]}
        else:
            result = {"found": False, "facts": ["Location information not available"]}

    # Name
    elif "name" in query_lower or "who" in query_lower:
        result = {"found": True, "facts": [f"The candidate is {CANDIDATE_DATA.get('fullName', 'Unknown')}"]}

    # Interview insights and briefs
    elif any(term in query_lower for term in ["interview", "brief", "insight", "work style", "collaboration", "career goal", "aspiration", "previous"]):
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
                logger.info(f"[EXPERIENCE_TOOL] Result: Found {len(insights)} interview insights")
                result = {"found": True, "facts": insights}

        # If no interview briefs found
        if not result:
            logger.info(f"[EXPERIENCE_TOOL] Result: No interview insights available")
            result = {"found": False, "facts": ["No previous interview insights available"]}

    # Job preferences
    elif any(term in query_lower for term in ["preference", "seeking", "work location", "relocate", "contract", "job search", "opportunity", "remote", "hybrid", "onsite", "full time", "part time"]):
        prefs = {
            "seeking_status": CANDIDATE_DATA.get('seekingOpportunities', ''),
            "employment_type": CANDIDATE_DATA.get('employmentType', ''),
            "work_locations": CANDIDATE_DATA.get('workLocations', []),
            "willing_to_relocate": CANDIDATE_DATA.get('willingToRelocate', None),
            "open_to_contract": CANDIDATE_DATA.get('openToContract', None)
        }

        # Format for natural conversation
        pref_facts = []
        if prefs["seeking_status"]:
            status = "actively" if prefs["seeking_status"] == "active" else "passively"
            pref_facts.append(f"Currently {status} seeking opportunities")
        if prefs["employment_type"]:
            emp_type = prefs["employment_type"].replace('_', '-')
            pref_facts.append(f"Prefers {emp_type} employment")
        if prefs["work_locations"]:
            locations = ', '.join(prefs["work_locations"])
            pref_facts.append(f"Open to {locations} work")
        if prefs["willing_to_relocate"] is not None:
            relocation = "Willing" if prefs["willing_to_relocate"] else "Not willing"
            pref_facts.append(f"{relocation} to relocate")
        if prefs["open_to_contract"] is not None:
            contract = "Open" if prefs["open_to_contract"] else "Not open"
            pref_facts.append(f"{contract} to contract work")

        if pref_facts:
            logger.info(f"[EXPERIENCE_TOOL] Result: Found {len(pref_facts)} job preferences")
            result = {"found": True, "facts": pref_facts}
        else:
            logger.info(f"[EXPERIENCE_TOOL] Result: No job preferences available")
            result = {"found": False, "facts": ["Job preferences not available"]}

    # Fallback - search interview briefs for relevant context
    else:
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
                logger.info(f"[EXPERIENCE_TOOL] Result: Found {len(relevant_insights)} relevant insights from interview briefs")
                result = {"found": True, "facts": relevant_insights}

        if not result:
            logger.info(f"[EXPERIENCE_TOOL] Result: No information found for query={query!r}")
            result = {"found": False, "facts": ["I couldn't find information about that specific query"]}

    tool_end = time.time()
    logger.info(f"[LAT-TOOL] Tool completed in {tool_end - tool_start:.3f}s")
    return result