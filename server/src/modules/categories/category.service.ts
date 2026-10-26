import { AppError } from '../../utils/app-error.js';
import { CategoryModel, type CategoryDoc, type CategoryType } from './category.model.js';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  type: CategoryType;
  description: string;
  image: string;
  children: CategoryNode[];
}

function toNode(category: CategoryDoc): CategoryNode {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    type: category.type,
    description: category.description,
    image: category.image,
    children: [],
  };
}

export async function getCategoryTree(type?: CategoryType): Promise<CategoryNode[]> {
  const categories = await CategoryModel.find({ status: 'VISIBLE', ...(type ? { type } : {}) })
    .sort({ _id: 1 })
    .lean();

  const nodes = new Map(categories.map((c) => [c._id.toString(), toNode(c)]));
  const roots: CategoryNode[] = [];
  for (const category of categories) {
    const node = nodes.get(category._id.toString());
    const parent = category.parentId ? nodes.get(category.parentId.toString()) : undefined;
    if (!node) continue;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

export async function getCategoryBySlug(slug: string): Promise<CategoryNode> {
  const category = await CategoryModel.findOne({ slug, status: 'VISIBLE' }).lean();
  if (!category) throw new AppError('NOT_FOUND', 404, 'Không tìm thấy danh mục');

  const node = toNode(category);
  const children = await CategoryModel.find({ parentId: category._id, status: 'VISIBLE' })
    .sort({ _id: 1 })
    .lean();
  node.children = children.map(toNode);
  return node;
}
