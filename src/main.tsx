import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { ToastContainer } from "react-toastify";
// Styles
import "react-toastify/dist/ReactToastify.css";
import { AuthGate } from "@/features/auth/components/AuthGate";
import { StoryProvider } from "@/features/stories/context/StoryContext";
import { QueryProvider } from "@/providers/QueryProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MainLayout } from "./components/MainLayout";
import { Workspace } from "./components/workspace/Workspace";
import "./index.css";
import { ThemeProvider } from "./lib/theme-provider";

// Lazy loaded pages
const StoryReader = lazy(() => import("./features/stories/pages/StoryReader").then(m => ({ default: m.StoryReader })));
const SeriesListPage = lazy(() => import("./features/series/pages/SeriesListPage"));
const SettingsPage = lazy(() => import("./features/ai/pages/SettingsPage"));
const GuidePage = lazy(() => import("./features/guide/pages/GuidePage"));
const DashboardPage = lazy(() => import("./features/dashboard/pages/DashboardPage"));
const ChatPage = lazy(() => import("./features/dashboard/pages/ChatPage"));

// Loading fallback component
const PageLoadingFallback = () => (
    <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
);
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
    <ErrorBoundary>
        <QueryProvider>
            <ThemeProvider defaultTheme="midnight" storageKey="app-theme">
                <AuthGate>
                    <BrowserRouter>
                        <StoryProvider>
                            <Suspense fallback={<PageLoadingFallback />}>
                                <Routes>
                                    <Route path="/" element={<Workspace />} />
                                    <Route element={<MainLayout />}>
                                        <Route path="/stories/:storyId/read" element={<StoryReader />} />
                                        <Route path="/series" element={<SeriesListPage />} />
                                        <Route path="/settings" element={<SettingsPage />} />
                                        <Route path="/guide" element={<GuidePage />} />
                                        <Route path="/dashboard/:storyId" element={<DashboardPage />} />
                                        <Route path="/dashboard/:storyId/chats/:chatId" element={<ChatPage />} />
                                    </Route>
                                </Routes>
                            </Suspense>
                        </StoryProvider>
                        <ToastContainer />
                    </BrowserRouter>
                </AuthGate>
            </ThemeProvider>
        </QueryProvider>
    </ErrorBoundary>
);
