import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { BrandMark } from "@/components/BrandMark";
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
                <div className="flex items-center gap-3 ml-4">
                    <BrandMark className="h-9" />
                    <span className="text-3xl font-bold">Guide</span>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>
                        Welcome to <span className="font-display font-semibold">Story Labyrinth</span>
                    </CardTitle>
                    <CardDescription>
                        Your comprehensive guide to using this AI-powered story writing application
                    </CardDescription>
                    <p className="text-xs text-muted-foreground pt-1">
                        A personal, freeware fork of{" "}
                        <a
                            href="https://github.com/JonSilver/TheStoryNexus"
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                        >
                            The Story Nexus
                        </a>
                        .
                    </p>
                </CardHeader>
                <CardContent>
                    <GuideTabs />
                </CardContent>
            </Card>
        </div>
    );
}
