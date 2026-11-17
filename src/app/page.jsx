import InvitationExperience from "@/components/experience/InvitationExperience";
import { createPageMetadata } from "@/lib/seo";

const HomePage = () => {
  return <InvitationExperience />;
};

export default HomePage;

export async function generateMetadata() {
  return createPageMetadata("/");
}
