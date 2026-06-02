import { UploadCloud, ListChecks, Sparkles, FileSpreadsheet } from 'lucide-react';

export function MarketingFeatures() {
  const features = [
    { icon: <UploadCloud className="h-6 w-6 text-cyan-300" />, accent: "bg-cyan-500/10 border-cyan-500/20", title: "Upload CVs", description: "Batch upload up to 100 resumes in PDF, DOCX, or Image formats." },
    { icon: <ListChecks className="h-6 w-6 text-amber-300" />, accent: "bg-amber-500/10 border-amber-500/20", title: "Choose Fields", description: "Define custom fields to extract, like specific skills or years of experience." },
    { icon: <Sparkles className="h-6 w-6 text-indigo-300" />, accent: "bg-indigo-500/10 border-indigo-500/20", title: "AI Extracts", description: "Our processing engine automatically maps unstructured data to your schema." },
    { icon: <FileSpreadsheet className="h-6 w-6 text-emerald-300" />, accent: "bg-emerald-500/10 border-emerald-500/20", title: "Export Results", description: "Download the structured data as XLSX or CSV, ready for your ATS." },
  ];

  return (
    <section className="pt-14 pb-20 px-6 bg-surface border-y border-border">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-heading font-bold mb-4">Built for HR teams that need speed and accuracy.</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Stop reading hundreds of CVs. Let our AI parser do the heavy lifting while you focus on hiring the best talent.</p>
        </div>
        
        <div className="grid md:grid-cols-4 gap-6">
          {features.map((feature, idx) => (
            <div key={idx} className="panel rounded-xl p-6 relative overflow-hidden group">
              <div className="mb-4">
                <div className={`h-12 w-12 rounded-lg border flex items-center justify-center ${feature.accent} transition-transform group-hover:scale-110`}>
                  {feature.icon}
                </div>
              </div>
              <h3 className="text-lg font-bold mb-2 text-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
