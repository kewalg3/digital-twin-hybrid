from livekit.agents import RunContext
import logging
import time

logger = logging.getLogger("work_style_tools")

# Work Style-specific tool for Work Style & Career Goals interviews
# Optimized for career counselor perspective asking about work preferences and aspirations
async def process_candidate_query(
    context: RunContext,
    query: str,
    candidate_data: dict = None
) -> dict:
    """Process career counselor queries about the candidate's background for work style interviews.

    Args:
        context: LiveKit RunContext
        query: What to look up (e.g. "career background", "current role satisfaction", "work preferences", "growth areas")
        candidate_data: The candidate's profile data
    """
    # Use the passed candidate data
    CANDIDATE_DATA = candidate_data

    # Log tool usage for monitoring with timing
    tool_start = time.time()
    logger.info(f"[WORK_STYLE_TOOL] getCandidateFacts query={query!r}")
    logger.info(f"[LAT-TOOL] Tool started at {tool_start:.3f}")

    if not CANDIDATE_DATA:
        logger.warning("No candidate data available")
        return {"found": False, "facts": ["Candidate data not available"]}

    query_lower = query.lower()

    # Define result variable
    result = None

    # Career background and professional summary
    if any(term in query_lower for term in ["background", "summary", "about", "career", "professional"]):
        summary = CANDIDATE_DATA.get('professionalSummary', '')
        current_role = CANDIDATE_DATA.get('jobTitle', '')
        company = CANDIDATE_DATA.get('company', '')

        facts = []
        if summary:
            facts.append(summary)

        if current_role:
            if company:
                facts.append(f"Currently working as {current_role} at {company}")
            else:
                facts.append(f"Currently working as {current_role}")

        experiences = CANDIDATE_DATA.get('experiences', [])
        if experiences:
            facts.append(f"Has {len(experiences)} professional experience(s) on record")

        if facts:
            logger.info(f"[WORK_STYLE_TOOL] Result: Returning career background")
            result = {"found": True, "facts": facts}
        else:
            logger.info(f"[WORK_STYLE_TOOL] Result: Generated basic background")
            result = {"found": True, "facts": [f"{CANDIDATE_DATA.get('fullName', 'The candidate')} is a professional with career experience."]}

    # Current role and satisfaction context
    elif any(term in query_lower for term in ["current", "role", "position", "job", "recent", "now", "present"]):
        current_role = CANDIDATE_DATA.get('jobTitle', '')
        company = CANDIDATE_DATA.get('company', '')

        facts = []
        if current_role and company:
            facts.append(f"Currently {current_role} at {company}")
        elif current_role:
            facts.append(f"Currently working as {current_role}")

        # Look for current role in experiences for more details
        experiences = CANDIDATE_DATA.get('experiences', [])
        current_exp = None
        for exp in experiences:
            if isinstance(exp, dict) and exp.get('isCurrentRole'):
                current_exp = exp
                break

        if current_exp:
            if current_exp.get('description'):
                facts.append(f"Role involves: {current_exp.get('description')}")
            if current_exp.get('startDate'):
                facts.append(f"Started in {current_exp.get('startDate')}")

        if facts:
            logger.info(f"[WORK_STYLE_TOOL] Result: Found current role information")
            result = {"found": True, "facts": facts}
        else:
            result = {"found": False, "facts": ["Current role information not available"]}

    # Work style and collaboration preferences (from previous interviews)
    elif any(term in query_lower for term in ["work style", "collaboration", "communication", "team", "environment", "preference", "approach"]):
        interview_briefs = CANDIDATE_DATA.get('interviewBriefs', [])
        work_style_insights = []

        for session in interview_briefs:
            if session.get('interviewBrief'):
                brief = session.get('interviewBrief')
                brief_str = str(brief).lower()

                # Look for work style related content in previous briefs
                if any(term in brief_str for term in ["collaboration", "communication", "team", "environment", "style", "approach"]):
                    work_style_insights.append({
                        "from_interview": f"{session.get('jobTitle', 'Previous')} interview",
                        "insight": brief
                    })

        if work_style_insights:
            logger.info(f"[WORK_STYLE_TOOL] Result: Found {len(work_style_insights)} work style insights")
            result = {"found": True, "facts": work_style_insights}
        else:
            logger.info(f"[WORK_STYLE_TOOL] Result: No previous work style insights")
            result = {"found": False, "facts": ["No previous work style insights available - this is a good opportunity to explore these preferences"]}

    # Career goals and motivations (from previous interviews)
    elif any(term in query_lower for term in ["goal", "aspiration", "motivation", "future", "next", "looking for", "seeking", "career path", "ambition"]):
        # Check job search preferences first
        prefs = {
            "seeking_status": CANDIDATE_DATA.get('seekingOpportunities', ''),
            "employment_type": CANDIDATE_DATA.get('employmentType', ''),
            "work_locations": CANDIDATE_DATA.get('workLocations', [])
        }

        goal_facts = []
        if prefs["seeking_status"]:
            status = "actively" if prefs["seeking_status"] == "active" else "passively"
            goal_facts.append(f"Currently {status} seeking new opportunities")

        if prefs["employment_type"]:
            emp_type = prefs["employment_type"].replace('_', '-')
            goal_facts.append(f"Interested in {emp_type} positions")

        if prefs["work_locations"]:
            locations = ', '.join(prefs["work_locations"])
            goal_facts.append(f"Open to {locations} work arrangements")

        # Look in interview briefs for career goal insights
        interview_briefs = CANDIDATE_DATA.get('interviewBriefs', [])
        for session in interview_briefs:
            if session.get('interviewBrief'):
                brief = session.get('interviewBrief')
                brief_str = str(brief).lower()

                if any(term in brief_str for term in ["goal", "aspiration", "future", "career", "next", "growth"]):
                    goal_facts.append({
                        "from_interview": f"{session.get('jobTitle', 'Previous')} interview",
                        "insight": brief
                    })

        if goal_facts:
            logger.info(f"[WORK_STYLE_TOOL] Result: Found career goal information")
            result = {"found": True, "facts": goal_facts}
        else:
            logger.info(f"[WORK_STYLE_TOOL] Result: No career goal insights available")
            result = {"found": False, "facts": ["Career goals and motivations have not been previously explored - perfect topic for this interview"]}

    # Skills and strengths context
    elif any(term in query_lower for term in ["skill", "strength", "expertise", "good at", "talented"]):
        skills = CANDIDATE_DATA.get('skills', [])
        if skills:
            skill_info = []
            for skill in skills[:10]:  # Limit to top 10 skills
                if skill.get('name'):
                    skill_detail = skill.get('name')
                    if skill.get('yearsOfExp'):
                        skill_detail += f" ({skill.get('yearsOfExp')} years)"
                    skill_info.append(skill_detail)

            logger.info(f"[WORK_STYLE_TOOL] Result: Found {len(skill_info)} skills")
            result = {"found": True, "facts": skill_info}
        else:
            logger.info(f"[WORK_STYLE_TOOL] Result: No skills found")
            result = {"found": False, "facts": ["Skills information not available"]}

    # Growth areas and learning interests
    elif any(term in query_lower for term in ["growth", "develop", "learn", "improve", "challenge", "development", "interest"]):
        # This is typically gathered during the interview, but check for any previous insights
        interview_briefs = CANDIDATE_DATA.get('interviewBriefs', [])
        development_insights = []

        for session in interview_briefs:
            if session.get('interviewBrief'):
                brief = session.get('interviewBrief')
                brief_str = str(brief).lower()

                if any(term in brief_str for term in ["development", "growth", "learn", "improve", "challenge"]):
                    development_insights.append({
                        "from_interview": f"{session.get('jobTitle', 'Previous')} interview",
                        "insight": brief
                    })

        if development_insights:
            logger.info(f"[WORK_STYLE_TOOL] Result: Found development insights")
            result = {"found": True, "facts": development_insights}
        else:
            logger.info(f"[WORK_STYLE_TOOL] Result: No development insights available")
            result = {"found": False, "facts": ["Professional development interests are a great topic to explore in this interview"]}

    # Company and industry preferences
    elif any(term in query_lower for term in ["company", "industry", "sector", "organization", "culture", "size", "type"]):
        facts = []

        # Look at experience history for industry patterns
        experiences = CANDIDATE_DATA.get('experiences', [])
        if experiences:
            companies = []
            for exp in experiences:
                if isinstance(exp, dict) and exp.get('company'):
                    companies.append(exp.get('company'))

            if companies:
                facts.append(f"Has experience with companies including: {', '.join(companies[:5])}")  # Limit to 5

        # Check interview briefs for company/culture preferences
        interview_briefs = CANDIDATE_DATA.get('interviewBriefs', [])
        for session in interview_briefs:
            if session.get('interviewBrief'):
                brief = session.get('interviewBrief')
                brief_str = str(brief).lower()

                if any(term in brief_str for term in ["company", "culture", "organization", "industry", "environment"]):
                    facts.append({
                        "from_interview": f"{session.get('jobTitle', 'Previous')} interview",
                        "insight": brief
                    })

        if facts:
            logger.info(f"[WORK_STYLE_TOOL] Result: Found company/industry information")
            result = {"found": True, "facts": facts}
        else:
            logger.info(f"[WORK_STYLE_TOOL] Result: No company preferences available")
            result = {"found": False, "facts": ["Company and industry preferences are important to discuss in this interview"]}

    # Personal information
    elif any(term in query_lower for term in ["name", "who", "location", "where"]):
        facts = []

        if "name" in query_lower or "who" in query_lower:
            facts.append(f"The candidate is {CANDIDATE_DATA.get('fullName', 'Unknown')}")

        if "location" in query_lower or "where" in query_lower:
            location = CANDIDATE_DATA.get('location', '')
            country = CANDIDATE_DATA.get('country', '')
            if location or country:
                loc_info = f"Located in {location}"
                if country:
                    loc_info += f", {country}"
                facts.append(loc_info)
            else:
                facts.append("Location information not available")

        if facts:
            result = {"found": True, "facts": facts}
        else:
            result = {"found": False, "facts": ["Basic information not available"]}

    # Fallback - search all interview content for relevant context
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
                logger.info(f"[WORK_STYLE_TOOL] Result: Found {len(relevant_insights)} relevant insights")
                result = {"found": True, "facts": relevant_insights}

        if not result:
            logger.info(f"[WORK_STYLE_TOOL] Result: No information found for query={query!r}")
            result = {"found": False, "facts": ["That's an interesting question - I'd love to hear your thoughts on that topic"]}

    tool_end = time.time()
    logger.info(f"[LAT-TOOL] Tool completed in {tool_end - tool_start:.3f}s")
    return result