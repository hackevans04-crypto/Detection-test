import { Navbar } from '@/components/landing/navbar'
import { HomeHero } from '@/components/home/home-hero'
import { SmoothScroll } from '@/components/home/smooth-scroll'
import { PlatformSection } from '@/components/landing/platform-section'
import { ProcessSection } from '@/components/landing/process-section'
import { TechnologySection } from '@/components/landing/technology-section'
import { InstitutionSection } from '@/components/landing/institution-section'
import { DeveloperSection } from '@/components/landing/developer-section'
import { FinalCta } from '@/components/landing/final-cta'
import { Footer } from '@/components/landing/footer'

export default function Page() {
  return (
    <>
      <Navbar />
      <SmoothScroll />
      <main>
        <HomeHero />
        <PlatformSection />
        <ProcessSection />
        <TechnologySection />
        <InstitutionSection />
        <DeveloperSection />
        <FinalCta />
      </main>
      <Footer />
    </>
  )
}
