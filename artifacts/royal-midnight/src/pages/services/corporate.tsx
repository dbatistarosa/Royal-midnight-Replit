import { Briefcase, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { PageSeo } from "@/components/PageSeo";

export default function Corporate() {
  return (
    <div className="py-24">
      <PageSeo
        title="Corporate Car Service South Florida | Executive Black Car Accounts"
        description="Corporate transportation accounts for South Florida businesses. Centralized billing, executive sedans and SUVs, dedicated concierge, and reliable service for your entire team. Set up a corporate account today."
        path="/services/corporate"
      />
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-3xl mb-16">
          <Link href="/services" className="text-primary hover:underline mb-6 inline-block">&larr; Back to Services</Link>
          <h1 className="font-serif text-4xl md:text-6xl mb-6">Corporate Accounts</h1>
          <p className="text-xl text-muted-foreground">
            Streamlined, reliable, and discreet transportation for executives and VIP clients.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-start mb-16">
          <div>
            <h2 className="font-serif text-2xl mb-6">Executive Excellence</h2>
            <p className="text-muted-foreground mb-6">
              We understand that corporate travel requires absolute reliability and seamless administration. A Royal Midnight corporate account provides your organization with priority booking, dedicated account management, and simplified billing.
            </p>
            <p className="text-muted-foreground mb-6">
              Entrust us with your VIPs, board members, and visiting executives. We serve as an extension of your company's commitment to quality.
            </p>
          </div>

          <div className="bg-card border border-border p-8 rounded-lg">
            <Briefcase className="w-12 h-12 text-primary mb-6" />
            <h3 className="font-serif text-2xl mb-6">Account Benefits:</h3>
            <ul className="space-y-4">
              {[
                "Priority booking and availability",
                "Dedicated corporate account manager",
                "Streamlined monthly invoicing",
                "Customized reporting",
                "Executive profiles with saved preferences",
                "Strict confidentiality agreements"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 pt-8 border-t border-border">
              <Link 
                href="/contact?subject=corporate" 
                className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
              >
                Inquire About Corporate Accounts
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
