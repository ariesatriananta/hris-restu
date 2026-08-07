import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import {
  knowledgeArticleSearchValues,
  normalizeKnowledgeArticle,
  type KnowledgeArticle,
} from '@/features/knowledge-base/domain'
import { KnowledgeBasePage } from '@/features/knowledge-base/knowledge-base-page'

const articleSchema = z
  .enum(knowledgeArticleSearchValues)
  .optional()
  .catch(undefined)

export const Route = createFileRoute('/_authenticated/panduan')({
  validateSearch: z.object({ artikel: articleSchema }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <KnowledgeBasePage
      article={normalizeKnowledgeArticle(search.artikel)}
      onArticleChange={(article?: KnowledgeArticle) =>
        void navigate({ search: { artikel: article }, replace: true })
      }
    />
  )
}
