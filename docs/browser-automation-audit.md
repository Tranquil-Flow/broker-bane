# Browser Automation Audit

**Date:** 2026-03-24
**Total Brokers:** 1,169

## Summary by Removal Method

| Method | Count | Browser Required? |
|--------|-------|-------------------|
| `email` | 343 | No - email only |
| `web_form` | 163 | **Yes** - requires Stagehand |
| `hybrid` | 663 | **Partial** - can try email first, fall back to browser |

## Browser Automation Strategy

### Email-Only (343 brokers)
- No browser automation needed
- Direct SMTP sending with templates (GDPR/CCPA/generic)
- Monitor inbox for confirmation replies

### Web Form (163 brokers) 
- **Requires Stagehand browser automation**
- Must navigate opt-out forms programmatically
- Many require CAPTCHA solving (NopeCHA)
- Examples: Spokeo, BeenVerified, Intelius, Whitepages

### Hybrid (663 brokers)
- **Prefer email first** - saves resources
- Fall back to browser if email bounces or no response
- Track which hybrids consistently need browser automation

## Top 10 Tier 1 Brokers Requiring Browser

These are high-priority targets that definitely need browser automation:

1. **Spokeo** - web_form, requires_email_confirm
2. **BeenVerified** - web_form, requires_captcha
3. **Whitepages** - web_form, requires_email_confirm  
4. **Intelius** - web_form, requires_captcha
5. **PeopleFinder** - web_form, requires_email_confirm
6. **TruePeopleSearch** - web_form (no confirm needed)
7. **FastPeopleSearch** - web_form (no confirm needed)
8. **ThatsThem** - web_form
9. **MyLife** - web_form, requires_captcha
10. **Radaris** - web_form, requires_email_confirm

## CAPTCHA Requirements

Brokers with `requires_captcha: true` need NopeCHA or similar:
- Check `data/brokers.yaml` for full list
- Approximately 15-20% of web_form brokers have CAPTCHAs

## Recommendations

1. **Phase 1 (current):** Focus on email-only brokers - 343 ready to automate
2. **Phase 2:** Implement Stagehand flows for top 10 web_form Tier 1 brokers
3. **Phase 3:** Add hybrid fallback - try email, then browser if needed
4. **Phase 4:** Expand to remaining web_form brokers

## Implementation Notes

- Stagehand playbooks live in `data/playbooks/`
- Each web_form broker should have a playbook YAML
- `form_hints` field in broker data provides step-by-step instructions
