from fastapi import FastAPI

from api.alpha_trace_research_workbench_routes import router as research_workbench_router


app = FastAPI(title="AlphaTrace Research Workbench API")
app.include_router(research_workbench_router)
