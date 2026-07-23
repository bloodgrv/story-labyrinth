import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GuideTabs } from "../components/GuideTabs";

export default function GuidePage() {
    const navigate = useNavigate();

    return (
        <div className="container mx-auto py-8 max-w-5xl">
            <div className="flex items-center mb-8">
                <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Button>
                <h1 className="text-3xl font-bold ml-4">The Story Nexus Guide</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Welcome to The Story Nexus</CardTitle>
                    <CardDescription>
                        Your comprehensive guide to using this AI-powered story writing application
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <GuideTabs />
                </CardContent>
            </Card>
        </div>
    );
}
