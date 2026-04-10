import React from 'react'
import Head from '@docusaurus/Head'
import Layout from '@theme/Layout'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import { LandingPage } from '../components/landing-page'
import {
  publicHomePageTitle,
  publicSiteDescription,
  publicSiteTitle,
  publicSiteUrl,
  publicSocialImageHref,
} from '../lib/public-docs-config'

/**
 * Framework-owned route entrypoint for the public landing page.
 *
 * @returns Rendered Docusaurus homepage.
 */
export default function IndexPage(): JSX.Element {
  const { siteConfig } = useDocusaurusContext()
  const apiReferenceEnabled = siteConfig.customFields?.apiReferenceEnabled === true
  const socialImageUrl = new URL(publicSocialImageHref, publicSiteUrl).toString()
  const pageTitle = `${publicSiteTitle} | ${publicHomePageTitle}`

  return (
    <Layout description={publicSiteDescription} title={publicHomePageTitle}>
      <Head>
        <link rel="canonical" href={publicSiteUrl} />
        <meta name="description" content={publicSiteDescription} />
        <meta
          name="keywords"
          content="SpecD, Spec-Driven Development, coding agents, code graph, impact analysis, monorepo workflow"
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={publicSiteDescription} />
        <meta property="og:url" content={publicSiteUrl} />
        <meta property="og:image" content={socialImageUrl} />
        <meta property="og:site_name" content={publicSiteTitle} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={publicSiteDescription} />
        <meta name="twitter:image" content={socialImageUrl} />
      </Head>
      <LandingPage apiReferenceEnabled={apiReferenceEnabled} />
    </Layout>
  )
}
